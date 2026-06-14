const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const XLSX = require('xlsx');
const { parse } = require('csv-parse/sync');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer config for file uploads
// Use /tmp on Vercel (serverless), local uploads/ dir otherwise
const isVercel = process.env.VERCEL === '1';
const uploadsDir = isVercel ? '/tmp' : path.join(__dirname, 'uploads');

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ hỗ trợ file .xlsx, .xls hoặc .csv'));
    }
  }
});

// Ensure uploads directory exists (local only)
if (!isVercel && !fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ============================================================
// API: Test SMTP Connection
// ============================================================
app.post('/api/test-connection', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng nhập email và App Password'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: email, pass: password }
    });

    await transporter.verify();

    res.json({
      success: true,
      message: 'Kết nối Gmail SMTP thành công!'
    });
  } catch (error) {
    let message = 'Không thể kết nối. ';
    if (error.code === 'EAUTH') {
      message += 'Sai email hoặc App Password. Hãy kiểm tra lại.';
    } else if (error.code === 'ESOCKET') {
      message += 'Lỗi kết nối mạng.';
    } else {
      message += error.message;
    }

    res.status(401).json({ success: false, message });
  }
});

// ============================================================
// API: Upload & Parse File
// ============================================================
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Không tìm thấy file upload'
      });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let data = [];

    if (ext === '.csv') {
      // Parse CSV
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      data = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true
      });
    } else {
      // Parse Excel
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    }

    // Cleanup uploaded file
    fs.unlinkSync(filePath);

    if (data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'File không có dữ liệu'
      });
    }

    // Detect email column
    const columns = Object.keys(data[0]);
    const emailColumn = columns.find(col =>
      col.toLowerCase().includes('email') || col.toLowerCase().includes('mail')
    );

    if (!emailColumn) {
      return res.status(400).json({
        success: false,
        message: 'Không tìm thấy cột email trong file. Hãy đảm bảo có cột tên "Email" hoặc "email".'
      });
    }

    // Validate email values
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidRows = [];
    data.forEach((row, index) => {
      if (!emailRegex.test(row[emailColumn])) {
        invalidRows.push(index + 2); // +2 for 1-indexed + header row
      }
    });

    res.json({
      success: true,
      data: data,
      columns: columns,
      emailColumn: emailColumn,
      totalRows: data.length,
      invalidRows: invalidRows,
      message: `Đã đọc ${data.length} dòng dữ liệu với ${columns.length} cột`
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi đọc file: ' + error.message
    });
  }
});

// ============================================================
// API: Preview Email
// ============================================================
app.post('/api/preview', (req, res) => {
  const { subject, body, recipient, isHtml } = req.body;

  try {
    const processedSubject = replaceVariables(subject, recipient);
    const processedBody = replaceVariables(body, recipient);

    res.json({
      success: true,
      preview: {
        subject: processedSubject,
        body: processedBody,
        isHtml: isHtml
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Lỗi preview: ' + error.message
    });
  }
});

// ============================================================
// API: Send Bulk Emails (SSE Stream)
// ============================================================
app.post('/api/send', async (req, res) => {
  const { email, password, subject, body, recipients, emailColumn, isHtml, delayMs } = req.body;

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: email, pass: password }
    });

    await transporter.verify();

    const delay = delayMs || 1500;
    let successCount = 0;
    let failCount = 0;
    const results = [];

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const toEmail = recipient[emailColumn];

      try {
        const processedSubject = replaceVariables(subject, recipient);
        const processedBody = replaceVariables(body, recipient);

        const mailOptions = {
          from: email,
          to: toEmail,
          subject: processedSubject,
        };

        if (isHtml) {
          mailOptions.html = processedBody;
        } else {
          mailOptions.text = processedBody;
        }

        await transporter.sendMail(mailOptions);
        successCount++;

        sendEvent({
          type: 'progress',
          index: i,
          total: recipients.length,
          email: toEmail,
          status: 'success',
          message: `✅ Gửi thành công đến ${toEmail}`,
          successCount,
          failCount
        });

        results.push({ email: toEmail, status: 'success' });

      } catch (error) {
        failCount++;

        sendEvent({
          type: 'progress',
          index: i,
          total: recipients.length,
          email: toEmail,
          status: 'error',
          message: `❌ Lỗi gửi đến ${toEmail}: ${error.message}`,
          successCount,
          failCount
        });

        results.push({ email: toEmail, status: 'error', error: error.message });
      }

      // Delay between emails (except last one)
      if (i < recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Send completion event
    sendEvent({
      type: 'complete',
      successCount,
      failCount,
      total: recipients.length,
      results
    });

    res.end();

  } catch (error) {
    sendEvent({
      type: 'error',
      message: 'Lỗi kết nối SMTP: ' + error.message
    });
    res.end();
  }
});

// ============================================================
// Helper: Replace template variables
// ============================================================
function replaceVariables(template, data) {
  if (!template) return '';
  return template.replace(/\{\{(.+?)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    return data[trimmedKey] !== undefined ? String(data[trimmedKey]) : match;
  });
}

// ============================================================
// Start Server
// ============================================================
// Only start listening when running locally (not on Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║   🚀 Bulk Email Sender đang chạy!       ║
  ║   📧 http://localhost:${PORT}              ║
  ╚══════════════════════════════════════════╝
    `);
  });
}

// Export for Vercel serverless
module.exports = app;
