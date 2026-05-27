'use strict';

process.env.NODE_ENV = 'test';

const config = require('../../src/config');
const path = require('path');

describe('Config Unit Tests', () => {
  it('has default values', () => {
    expect(config.port).toBeDefined();
    expect(config.jwtSecret).toBeDefined();
    expect(config.jwtExpiresIn).toBeDefined();
    expect(config.vectorDbPath).toBeDefined();
  });

  it('isTest() returns true when NODE_ENV=test', () => {
    config.nodeEnv = 'test';
    expect(config.isTest()).toBe(true);
  });

  it('isTest() returns false when NODE_ENV is not test', () => {
    config.nodeEnv = 'development';
    expect(config.isTest()).toBe(false);
    config.nodeEnv = 'test'; // restore
  });
  
  it('isCommandAllowed() returns true for *', () => {
    config.allowedCommands = '*';
    expect(config.isCommandAllowed('ls -la')).toBe(true);
  });

  it('isCommandAllowed() checks the first word against the comma-separated list', () => {
    config.allowedCommands = 'ls, ping, whoami';
    expect(config.isCommandAllowed('ping 8.8.8.8')).toBe(true);
    expect(config.isCommandAllowed('ls -la')).toBe(true);
    expect(config.isCommandAllowed('cat /etc/passwd')).toBe(false);
  });
});
