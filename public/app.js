// ============================================================
// BULK EMAIL SENDER — Frontend Logic
// ============================================================

(function () {
  'use strict';

  // ---------- State ----------
  const state = {
    currentStep: 1,
    smtpEmail: '',
    smtpPassword: '',
    smtpName: '',
    smtpVerified: false,
    fileData: [],
    columns: [],
    emailColumn: '',
    isHtml: false,
    previewIndex: 0,
    isSending: false,
  };

  // ---------- DOM Elements ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Step navigation
  const steps = $$('.step');
  const stepLines = $$('.step-line');
  const panels = $$('.panel');

  // Step 1
  const smtpEmailInput = $('#smtp-email');
  const smtpNameInput = $('#smtp-name');
  const smtpPasswordInput = $('#smtp-password');
  const btnTestConnection = $('#btn-test-connection');
  const btnNext1 = $('#btn-next-1');
  const connectionStatus = $('#connection-status');

  // Step 2
  const dropZone = $('#drop-zone');
  const fileInput = $('#file-input');
  const fileInfo = $('#file-info');
  const fileName = $('#file-name');
  const rowCount = $('#row-count');
  const colCount = $('#col-count');
  const invalidWarning = $('#invalid-warning');
  const tableHeader = $('#table-header');
  const tableBody = $('#table-body');
  const btnPrev2 = $('#btn-prev-2');
  const btnNext2 = $('#btn-next-2');

  // Step 3
  const toggleText = $('#toggle-text');
  const toggleHtml = $('#toggle-html');
  const emailSubject = $('#email-subject');
  const emailBody = $('#email-body');
  const variableList = $('#variable-list');
  const previewPrev = $('#preview-prev');
  const previewNext = $('#preview-next');
  const previewIndex = $('#preview-index');
  const previewTo = $('#preview-to');
  const previewSubject = $('#preview-subject');
  const previewBody = $('#preview-body');
  const btnPrev3 = $('#btn-prev-3');
  const btnNext3 = $('#btn-next-3');

  // Step 4
  const summaryRecipients = $('#summary-recipients');
  const summaryFrom = $('#summary-from');
  const summaryTime = $('#summary-time');
  const summarySubject = $('#summary-subject');
  const sendDelay = $('#send-delay');
  const btnPrev4 = $('#btn-prev-4');
  const btnSend = $('#btn-send');

  const sendSummary = $('#send-summary');
  const sendProgress = $('#send-progress');
  const progressSuccess = $('#progress-success');
  const progressFail = $('#progress-fail');
  const progressCurrent = $('#progress-current');
  const progressTotal = $('#progress-total');
  const progressBar = $('#progress-bar');
  const progressPercent = $('#progress-percent');
  const sendLog = $('#send-log');

  const sendResult = $('#send-result');
  const resultIcon = $('#result-icon');
  const resultTitle = $('#result-title');
  const resultMessage = $('#result-message');
  const btnReset = $('#btn-reset');

  // ============================================================
  // Navigation
  // ============================================================

  function goToStep(stepNum) {
    if (stepNum < 1 || stepNum > 4) return;

    state.currentStep = stepNum;

    // Update steps UI
    steps.forEach((step, i) => {
      const num = i + 1;
      step.classList.remove('active', 'completed');
      if (num === stepNum) step.classList.add('active');
      else if (num < stepNum) step.classList.add('completed');
    });

    // Update step lines
    stepLines.forEach((line, i) => {
      line.classList.toggle('active', i < stepNum - 1);
    });

    // Show active panel
    panels.forEach((panel, i) => {
      panel.classList.toggle('active', i + 1 === stepNum);
    });

    // Step-specific init
    if (stepNum === 3) initCompose();
    if (stepNum === 4) initSendSummary();
  }

  // ============================================================
  // Step 1: SMTP Config
  // ============================================================

  btnTestConnection.addEventListener('click', async () => {
    const email = smtpEmailInput.value.trim();
    const password = smtpPasswordInput.value.trim();

    if (!email || !password) {
      showStatus(connectionStatus, 'error', 'Vui lòng nhập đầy đủ email và App Password');
      return;
    }

    showStatus(connectionStatus, 'loading', '<span class="spinner"></span> Đang kiểm tra kết nối...');
    btnTestConnection.disabled = true;

    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        showStatus(connectionStatus, 'success', '✅ ' + data.message);
        state.smtpEmail = email;
        state.smtpPassword = password;
        state.smtpName = smtpNameInput.value.trim();
        state.smtpVerified = true;
        btnNext1.disabled = false;
        showToast('success', 'Kết nối SMTP thành công!');
      } else {
        showStatus(connectionStatus, 'error', '❌ ' + data.message);
        state.smtpVerified = false;
        btnNext1.disabled = true;
      }
    } catch (err) {
      showStatus(connectionStatus, 'error', '❌ Lỗi kết nối server: ' + err.message);
    } finally {
      btnTestConnection.disabled = false;
    }
  });

  btnNext1.addEventListener('click', () => goToStep(2));

  // ============================================================
  // Step 2: File Upload
  // ============================================================

  // Drag & Drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });

  dropZone.addEventListener('click', (e) => {
    if (e.target.closest('.btn-outline') || e.target.closest('label')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) uploadFile(fileInput.files[0]);
  });

  async function uploadFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      showToast('error', 'Chỉ hỗ trợ file .xlsx, .xls hoặc .csv');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    dropZone.innerHTML = `
      <div class="drop-zone-content">
        <span class="spinner" style="width:32px;height:32px;border-width:3px;color:var(--accent-light)"></span>
        <p class="drop-text" style="margin-top:1rem">Đang đọc file...</p>
      </div>
    `;

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.success) {
        state.fileData = data.data;
        state.columns = data.columns;
        state.emailColumn = data.emailColumn;

        // Show file info
        fileName.textContent = file.name;
        rowCount.textContent = data.totalRows;
        colCount.textContent = data.columns.length;

        // Invalid warning
        if (data.invalidRows.length > 0) {
          invalidWarning.classList.remove('hidden');
          invalidWarning.querySelector('span').textContent =
            `${data.invalidRows.length} dòng có email không hợp lệ (dòng ${data.invalidRows.slice(0, 5).join(', ')}${data.invalidRows.length > 5 ? '...' : ''})`;
        } else {
          invalidWarning.classList.add('hidden');
        }

        // Render table
        renderTable(data.columns, data.data, data.emailColumn);

        fileInfo.classList.remove('hidden');
        dropZone.style.display = 'none';
        btnNext2.disabled = false;

        showToast('success', `Đã đọc ${data.totalRows} dòng dữ liệu`);
      } else {
        resetDropZone();
        showToast('error', data.message);
      }
    } catch (err) {
      resetDropZone();
      showToast('error', 'Lỗi upload: ' + err.message);
    }
  }

  function renderTable(columns, data, emailCol) {
    // Header
    tableHeader.innerHTML = columns
      .map((col) => `<th class="${col === emailCol ? 'email-col' : ''}">${escapeHtml(col)}</th>`)
      .join('');

    // Body (max 50 rows for preview)
    const rows = data.slice(0, 50);
    tableBody.innerHTML = rows
      .map(
        (row) =>
          '<tr>' +
          columns.map((col) => `<td>${escapeHtml(String(row[col] || ''))}</td>`).join('') +
          '</tr>'
      )
      .join('');

    if (data.length > 50) {
      tableBody.innerHTML += `
        <tr><td colspan="${columns.length}" style="text-align:center;color:var(--text-muted);font-style:italic">
          ... và ${data.length - 50} dòng nữa
        </td></tr>`;
    }
  }

  function resetDropZone() {
    dropZone.style.display = '';
    dropZone.innerHTML = `
      <div class="drop-zone-content">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="drop-icon">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <p class="drop-text">Kéo & thả file vào đây</p>
        <p class="drop-subtext">hoặc</p>
        <label class="btn btn-outline" for="file-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Chọn file
        </label>
        <p class="drop-formats">Hỗ trợ: .xlsx, .xls, .csv</p>
      </div>
    `;
  }

  btnPrev2.addEventListener('click', () => goToStep(1));
  btnNext2.addEventListener('click', () => goToStep(3));

  // ============================================================
  // Step 3: Compose Email
  // ============================================================

  function initCompose() {
    // Render variable tags
    variableList.innerHTML = state.columns
      .map((col) => `<span class="var-tag" data-var="${escapeHtml(col)}">${escapeHtml(col)}</span>`)
      .join('');

    // Click to insert
    variableList.querySelectorAll('.var-tag').forEach((tag) => {
      tag.addEventListener('click', () => {
        const varName = tag.dataset.var;
        const varText = `{{${varName}}}`;

        // Insert at cursor position in body
        const textarea = emailBody;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        textarea.value = text.substring(0, start) + varText + text.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + varText.length;

        updatePreview();
        showToast('info', `Đã chèn {{${varName}}}`);
      });
    });

    // Reset preview index
    state.previewIndex = 0;
    updatePreview();
  }

  // Toggle text/html
  toggleText.addEventListener('click', () => {
    state.isHtml = false;
    toggleText.classList.add('active');
    toggleHtml.classList.remove('active');
  });

  toggleHtml.addEventListener('click', () => {
    state.isHtml = true;
    toggleHtml.classList.add('active');
    toggleText.classList.remove('active');
  });

  // Preview navigation
  previewPrev.addEventListener('click', () => {
    if (state.previewIndex > 0) {
      state.previewIndex--;
      updatePreview();
    }
  });

  previewNext.addEventListener('click', () => {
    if (state.previewIndex < state.fileData.length - 1) {
      state.previewIndex++;
      updatePreview();
    }
  });

  // Live preview on input
  emailSubject.addEventListener('input', updatePreview);
  emailBody.addEventListener('input', updatePreview);

  // Enable next button
  emailSubject.addEventListener('input', checkComposeValid);
  emailBody.addEventListener('input', checkComposeValid);

  function checkComposeValid() {
    btnNext3.disabled = !(emailSubject.value.trim() && emailBody.value.trim());
  }

  function updatePreview() {
    const total = state.fileData.length;
    if (total === 0) {
      previewIndex.textContent = '0 / 0';
      previewTo.textContent = '—';
      previewSubject.textContent = '—';
      previewBody.textContent = 'Chưa có dữ liệu';
      return;
    }

    const idx = state.previewIndex;
    const recipient = state.fileData[idx];

    previewIndex.textContent = `${idx + 1} / ${total}`;
    previewTo.textContent = recipient[state.emailColumn] || '—';
    previewSubject.textContent = replaceVariables(emailSubject.value, recipient);

    const bodyContent = replaceVariables(emailBody.value, recipient);
    if (state.isHtml) {
      previewBody.innerHTML = bodyContent;
    } else {
      previewBody.textContent = bodyContent;
    }
  }

  btnPrev3.addEventListener('click', () => goToStep(2));
  btnNext3.addEventListener('click', () => goToStep(4));

  // ============================================================
  // Step 4: Send
  // ============================================================

  function initSendSummary() {
    summaryRecipients.textContent = state.fileData.length;
    state.smtpName = smtpNameInput.value.trim();
    summaryFrom.textContent = state.smtpName ? `${state.smtpName} <${state.smtpEmail}>` : state.smtpEmail;
    summarySubject.textContent = emailSubject.value;

    const delayVal = parseInt(sendDelay.value) || 1500;
    const totalMs = state.fileData.length * delayVal;
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.ceil((totalMs % 60000) / 1000);
    summaryTime.textContent = mins > 0 ? `~${mins} phút ${secs} giây` : `~${secs} giây`;

    // Reset UI
    sendSummary.classList.remove('hidden');
    sendProgress.classList.add('hidden');
    sendResult.classList.add('hidden');
    btnPrev4.disabled = false;
    btnSend.disabled = false;
  }

  sendDelay.addEventListener('input', () => {
    const delayVal = parseInt(sendDelay.value) || 1500;
    const totalMs = state.fileData.length * delayVal;
    const mins = Math.floor(totalMs / 60000);
    const secs = Math.ceil((totalMs % 60000) / 1000);
    summaryTime.textContent = mins > 0 ? `~${mins} phút ${secs} giây` : `~${secs} giây`;
  });

  btnPrev4.addEventListener('click', () => {
    if (!state.isSending) goToStep(3);
  });

  btnSend.addEventListener('click', startSending);

  async function startSending() {
    if (state.isSending) return;
    state.isSending = true;

    // Hide summary, show progress
    sendSummary.classList.add('hidden');
    sendProgress.classList.remove('hidden');
    sendResult.classList.add('hidden');
    btnPrev4.disabled = true;
    btnSend.disabled = true;

    // Reset progress
    progressSuccess.textContent = '0';
    progressFail.textContent = '0';
    progressCurrent.textContent = '0';
    progressTotal.textContent = state.fileData.length;
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    sendLog.innerHTML = '';

    const delayVal = parseInt(sendDelay.value) || 1500;

    try {
      const response = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: state.smtpEmail,
          password: state.smtpPassword,
          senderName: state.smtpName,
          subject: emailSubject.value,
          body: emailBody.value,
          recipients: state.fileData,
          emailColumn: state.emailColumn,
          isHtml: state.isHtml,
          delayMs: delayVal,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process SSE events
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSendEvent(data);
            } catch (e) {
              // Skip malformed JSON
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          handleSendEvent(data);
        } catch (e) {}
      }

    } catch (err) {
      showToast('error', 'Lỗi kết nối: ' + err.message);
      showResult(0, state.fileData.length);
    }

    state.isSending = false;
  }

  function handleSendEvent(data) {
    if (data.type === 'progress') {
      const { index, total, email, status, message, successCount, failCount } = data;
      const current = index + 1;
      const percent = Math.round((current / total) * 100);

      progressSuccess.textContent = successCount;
      progressFail.textContent = failCount;
      progressCurrent.textContent = current;
      progressBar.style.width = percent + '%';
      progressPercent.textContent = percent + '%';

      // Add log entry
      const entry = document.createElement('div');
      entry.className = `log-entry ${status}`;
      entry.innerHTML = `
        <span class="log-index">#${current}</span>
        <span class="log-message">${escapeHtml(message)}</span>
      `;
      sendLog.appendChild(entry);
      sendLog.scrollTop = sendLog.scrollHeight;

    } else if (data.type === 'complete') {
      showResult(data.successCount, data.failCount);

    } else if (data.type === 'error') {
      showToast('error', data.message);
      showResult(0, state.fileData.length);
    }
  }

  function showResult(successCount, failCount) {
    sendResult.classList.remove('hidden');

    // Remove old classes
    resultIcon.classList.remove('success', 'error', 'partial');

    if (failCount === 0) {
      resultIcon.classList.add('success');
      resultTitle.textContent = 'Hoàn tất!';
      resultMessage.textContent = `Đã gửi thành công ${successCount} email.`;
    } else if (successCount === 0) {
      resultIcon.classList.add('error');
      resultIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      resultTitle.textContent = 'Gửi thất bại';
      resultMessage.textContent = `Tất cả ${failCount} email đều gửi thất bại. Kiểm tra log ở trên.`;
    } else {
      resultIcon.classList.add('partial');
      resultIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      resultTitle.textContent = 'Hoàn tất (có lỗi)';
      resultMessage.textContent = `${successCount} thành công, ${failCount} thất bại. Kiểm tra log ở trên.`;
    }
  }

  // Reset
  btnReset.addEventListener('click', () => {
    // Reset state
    state.fileData = [];
    state.columns = [];
    state.emailColumn = '';
    state.previewIndex = 0;
    state.smtpVerified = false;

    // Reset inputs
    smtpEmailInput.value = '';
    smtpNameInput.value = '';
    smtpPasswordInput.value = '';
    emailSubject.value = '';
    emailBody.value = '';
    connectionStatus.classList.add('hidden');
    btnNext1.disabled = true;
    btnNext2.disabled = true;
    btnNext3.disabled = true;

    // Reset file upload
    fileInfo.classList.add('hidden');
    resetDropZone();
    dropZone.style.display = '';

    goToStep(1);
    showToast('info', 'Đã reset. Sẵn sàng gửi đợt mới!');
  });

  // ============================================================
  // Utilities
  // ============================================================

  function replaceVariables(template, data) {
    if (!template) return '';
    return template.replace(/\{\{(.+?)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      return data[trimmedKey] !== undefined ? String(data[trimmedKey]) : match;
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showStatus(el, type, html) {
    el.className = `status-box ${type}`;
    el.innerHTML = html;
    el.classList.remove('hidden');
  }

  function showToast(type, message) {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease-out forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

})();
