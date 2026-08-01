const fs = require('fs');
const AiModelsStore = require('../../src/services/aiModelsStore');

jest.mock('fs');

describe('AiModelsStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getModels returns default models when file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    const models = AiModelsStore.getModels('openai');
    expect(models).toContain('gpt-4o');
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('getModels reads from file', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ custom: ['m1'] }));
    const models = AiModelsStore.getModels('custom');
    expect(models).toEqual(['m1']);
  });

  it('getModels handles error', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockImplementation(() => { throw new Error('read error'); });
    const models = AiModelsStore.getModels('openai');
    expect(models).toContain('gpt-4o'); // fallbacks to default
  });

  it('setModels writes to file', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({}));
    AiModelsStore.setModels('custom', ['m1', 'm1']);
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"m1"'));
  });

  it('addModel adds a model', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ custom: ['m1'] }));
    AiModelsStore.addModel('custom', 'm2');
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"m2"'));
  });

  it('addModel adds a new provider', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({}));
    AiModelsStore.addModel('custom2', 'm2');
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('"m2"'));
  });

  it('removeModel removes a model', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ custom: ['m1', 'm2'] }));
    AiModelsStore.removeModel('custom', 'm1');
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.not.stringContaining('"m1"'));
  });
});
