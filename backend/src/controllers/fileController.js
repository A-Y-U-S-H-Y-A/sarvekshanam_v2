'use strict';

const xlsx = require('xlsx');

// POST /api/files/upload
exports.uploadTargets = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const buffer = req.file.buffer;
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      return res.status(400).json({ success: false, error: 'Empty or invalid workbook' });
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Parse sheet to JSON array, taking the first row as headers
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
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

  } catch (err) {
    next(err);
  }
};

// POST /api/files/download
exports.downloadTargets = async (req, res, next) => {
  try {
    const { format = 'csv', entries = [] } = req.body;
    
    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, error: 'entries must be an array' });
    }
    
    // Create worksheet from json
    const worksheet = xlsx.utils.json_to_sheet(entries.length ? entries : [ { Target: '' } ]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Targets');
    
    let buffer;
    if (format === 'csv') {
      buffer = xlsx.write(workbook, { bookType: 'csv', type: 'buffer' });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="targets.csv"');
    } else {
      buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="targets.xlsx"');
    }
    
    res.send(buffer);
  } catch (err) {
    next(err);
  }
};
