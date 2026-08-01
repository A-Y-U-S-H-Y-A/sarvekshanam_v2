'use strict';

const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/responseHelper');

const asyncHandler = require('../utils/asyncHandler');



// POST /api/files/upload
exports.uploadTargets = asyncHandler(async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const buffer = req.file.buffer;
    let rawData = [];
    if (req.file.originalname && req.file.originalname.toLowerCase().endsWith('.csv')) {
      const text = buffer.toString('utf8');
      rawData = text.split('\n').filter(l => l.trim()).map(line => line.split(','));
    } else {
      const readXlsxFile = require('read-excel-file/node');
      rawData = await readXlsxFile(buffer);
    }
    if (rawData.length < 2) {
      return res.status(400).json({ success: false, error: 'Sheet must contain at least a header row and one data row' });
    }

    const headers = rawData[0].map(h => String(h).trim());
    
    // Construct rows as objects
    const rows = [];
    for (let i = 1; i < rawData.length; i++) {
      const rowArr = rawData[i];
      // Skip completely empty rows
      if (!rowArr || rowArr.every(cell => cell === '')) continue;
      
      const rowObj = {};
      for (let j = 0; j < headers.length; j++) {
        rowObj[headers[j]] = rowArr[j] !== undefined ? String(rowArr[j]).trim() : '';
      }
      rows.push(rowObj);
    }

    res.json({
      success: true,
      data: {
        headers,
        rows
      }
    });

  });

// POST /api/files/download
exports.downloadTargets = asyncHandler(async (req, res, next) => {
    const { format = 'csv', entries = [] } = req.body;
    
    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, error: 'entries must be an array' });
    }
    
    const rows = entries.length ? entries : [ { Target: '' } ];
    const headers = Object.keys(rows[0]);
    
    let buffer;
    if (format === 'csv') {
      let csvStr = headers.join(',') + '\n';
      for (const row of rows) {
        csvStr += headers.map(h => {
           let val = row[h] || '';
           if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
              return '"' + val.replace(/"/g, '""') + '"';
           }
           return val;
        }).join(',') + '\n';
      }
      buffer = Buffer.from(csvStr, 'utf8');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="targets.csv"');
    } else {
      const writeXlsxFile = require('write-excel-file/node');
      const data = [];
      data.push(headers.map(h => ({ value: String(h), fontWeight: 'bold' })));
      for (const row of rows) {
         data.push(headers.map(h => {
            let val = row[h];
            if (val == null) return { value: '' };
            if (typeof val === 'number') return { type: Number, value: val };
            if (typeof val === 'boolean') return { type: Boolean, value: val };
            return { type: String, value: String(val) };
         }));
      }
      buffer = await writeXlsxFile(data, { buffer: true });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="targets.xlsx"');
    }
    
    res.send(buffer);
  });
