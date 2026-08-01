'use strict';

const { getCleanupService } = require('../../src/services/cleanupService');
const cron = require('node-cron');
const { getDb } = require('../../src/db/database');
const { Op } = require('sequelize');

jest.mock('node-cron', () => ({
  schedule: jest.fn()
}));

jest.mock('../../src/db/database', () => ({
  getDb: jest.fn()
}));

describe('CleanupService', () => {
  let cleanupService;
  let mockDb;
  let mockTask;

  beforeEach(() => {
    jest.clearAllMocks();
    cleanupService = getCleanupService();
    // Reset instance state if necessary (it's a singleton, so we'll just stop it)
    cleanupService.stop();

    mockTask = { stop: jest.fn() };
    cron.schedule.mockReturnValue(mockTask);

    mockDb = {
      Appointment: {
        options: { paranoid: true },
        destroy: jest.fn().mockResolvedValue(2)
      },
      ScanSession: {
        options: { paranoid: false },
        destroy: jest.fn()
      },
      User: {
        options: { paranoid: true },
        destroy: jest.fn().mockRejectedValue(new Error('DB Error'))
      }
    };
    getDb.mockReturnValue(mockDb);

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts the cleanup service and runs initial sweep', async () => {
    const sweepSpy = jest.spyOn(cleanupService, 'sweep').mockResolvedValue();
    cleanupService.start();
    
    expect(console.log).toHaveBeenCalledWith('[CleanupService] Starting cleanup service...');
    expect(sweepSpy).toHaveBeenCalled();
    expect(cron.schedule).toHaveBeenCalledWith('*/15 * * * *', expect.any(Function));

    // trigger the cron callback
    const cronCallback = cron.schedule.mock.calls[0][1];
    await cronCallback();
    expect(sweepSpy).toHaveBeenCalledTimes(2);
  });

  it('stops the cleanup service', () => {
    cleanupService.start();
    cleanupService.stop();
    expect(mockTask.stop).toHaveBeenCalled();
    expect(cleanupService._task).toBeNull();
  });

  it('does nothing if stopped when already stopped', () => {
    cleanupService.stop(); // no-op
    expect(mockTask.stop).not.toHaveBeenCalled();
  });

  it('sweeps and hard deletes old records for paranoid models', async () => {
    await cleanupService.sweep();
    
    // Appointment should be called because paranoid: true
    expect(mockDb.Appointment.destroy).toHaveBeenCalledWith({
      where: {
        deleted_at: {
          [Op.lt]: expect.any(Date)
        }
      },
      force: true
    });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[CleanupService] Permanently deleted 2 records from Appointment'));

    // ScanSession should be skipped because paranoid: false
    expect(mockDb.ScanSession.destroy).not.toHaveBeenCalled();

    // User throws an error
    expect(mockDb.User.destroy).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[CleanupService] Error cleaning up User:'), 'DB Error');
  });
  
  it('handles sweep failure on start', async () => {
    jest.spyOn(cleanupService, 'sweep').mockRejectedValue(new Error('Sweep failed'));
    cleanupService.start();
    
    // Wait a tick for the promise to reject
    await new Promise(process.nextTick);
    expect(console.error).toHaveBeenCalledWith('[CleanupService] Initial sweep failed:', expect.any(Error));
  });

  it('handles sweep failure on scheduled run', async () => {
    const sweepSpy = jest.spyOn(cleanupService, 'sweep').mockRejectedValue(new Error('Sweep failed'));
    cleanupService.start();
    const cronCallback = cron.schedule.mock.calls[0][1];
    
    await cronCallback();
    expect(console.error).toHaveBeenCalledWith('[CleanupService] Scheduled sweep failed:', expect.any(Error));
  });
});
