const fileController = require('../../src/controllers/fileController');
const { getProxyService } = require('../../src/services/proxyService'); // dummy if needed

jest.mock('read-excel-file/node', () => jest.fn().mockResolvedValue([['H1', 'H2'], ['V1', 'V2'], ['']]));
jest.mock('write-excel-file/node', () => jest.fn().mockReturnValue({ toBuffer: () => Promise.resolve(Buffer.from('xlsx data')) }));

describe('FileController', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: { id: 1 }, body: {}, file: null };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn()
    };
    next = jest.fn();
  });

  describe('uploadTargets', () => {
    it('returns 400 if no file', async () => {
      await fileController.uploadTargets(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('processes CSV file', async () => {
      req.file = {
        originalname: 'test.csv',
        buffer: Buffer.from('H1,H2\nV1,V2\n')
      };
      await fileController.uploadTargets(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('processes XLSX file', async () => {
      req.file = {
        originalname: 'test.xlsx',
        buffer: Buffer.from('dummy')
      };
      await fileController.uploadTargets(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 400 if too few rows', async () => {
      const readXlsxFileMock = require('read-excel-file/node');
      readXlsxFileMock.mockResolvedValueOnce([['H1']]);
      req.file = { originalname: 'test.xlsx', buffer: Buffer.from('dummy') };
      await fileController.uploadTargets(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('downloadTargets', () => {
    it('returns 400 if entries is not an array', async () => {
      req.body = { entries: 'invalid' };
      await fileController.downloadTargets(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('downloads CSV format', async () => {
      req.body = { format: 'csv', entries: [{ a: 1, b: 'test,with,comma' }] };
      await fileController.downloadTargets(req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.send).toHaveBeenCalled();
    });

    it('downloads XLSX format', async () => {
      req.body = { format: 'xlsx', entries: [{ a: 1, b: true, c: null }] };
      await fileController.downloadTargets(req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.send).toHaveBeenCalled();
    });
  });
});
