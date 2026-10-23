/**
 * Pulse UX Remote Cloud Terminal Component
 * Interactive remote shell console to sensors with command history and diagnostic shortcuts.
 */

let activeTerminalSensorId = null;
let activeTerminalSensorName = null;
let commandHistory = [];
let historyIndex = -1;
let isCommandExecuting = false;

function initRemoteTerminal() {
  const inputEl = document.getElementById('terminal-input');
  if (inputEl) {
    inputEl.addEventListener('keydown', handleTerminalKeydown);
  }

  // Quick preset shortcuts
  const presetBtns = document.querySelectorAll('.term-preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) {
        executeTerminalCommand(cmd);
      }
    });
  });

  // Esc key closes modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('modal-remote-terminal');
      if (modal && modal.style.display !== 'none') {
        closeRemoteTerminal();
      }
    }
  });
}

function openRemoteTerminal(sensorId, sensorName, sensorIp) {
  activeTerminalSensorId = sensorId || 'sensor-kali-arm64';
  activeTerminalSensorName = sensorName || activeTerminalSensorId;

  const modal = document.getElementById('modal-remote-terminal');
  const titleEl = document.getElementById('terminal-modal-title');
  const metaEl = document.getElementById('terminal-modal-meta');
  const promptEl = document.getElementById('terminal-prompt-label');
  const inputEl = document.getElementById('terminal-input');

  if (titleEl) titleEl.innerText = `Remote Cloud Console — ${activeTerminalSensorName}`;
  if (metaEl) metaEl.innerText = `Connected to ${activeTerminalSensorId} • IP: ${sensorIp || '192.168.64.4'} • Realtime Secure Shell`;
  if (promptEl) promptEl.innerText = `mario@${activeTerminalSensorName}:~$`;

  if (modal) {
    modal.style.display = 'flex';
  }

  // Focus input
  setTimeout(() => {
    if (inputEl) {
      inputEl.focus();
    }
  }, 100);

  // If screen is empty, show welcome banner
  const outputEl = document.getElementById('terminal-output');
  if (outputEl && outputEl.children.length === 0) {
    appendTerminalLine(`\x1b[1;36mPulse UX Remote Cloud Console v2.4.0\x1b[0m\nConnected to host \x1b[1;32m${activeTerminalSensorName}\x1b[0m via secure reverse control bus.\nType any Linux command or select a diagnostic preset below.\nType \x1b[1;33mhelp\x1b[0m or \x1b[1;33mclear\x1b[0m at any time.\n─────────────────────────────────────────────────────────────────────────────\n`);
  }
}

function closeRemoteTerminal() {
  const modal = document.getElementById('modal-remote-terminal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function clearTerminal() {
  const outputEl = document.getElementById('terminal-output');
  if (outputEl) {
    outputEl.innerHTML = '';
  }
  const inputEl = document.getElementById('terminal-input');
  if (inputEl) inputEl.focus();
}

function handleTerminalKeydown(e) {
  const inputEl = document.getElementById('terminal-input');
  if (!inputEl) return;

  if (e.key === 'Enter') {
    e.preventDefault();
    const cmd = inputEl.value.trim();
    if (!cmd) return;

    // Save to history
    commandHistory.push(cmd);
    historyIndex = commandHistory.length;
    inputEl.value = '';

    executeTerminalCommand(cmd);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (commandHistory.length > 0 && historyIndex > 0) {
      historyIndex--;
      inputEl.value = commandHistory[historyIndex] || '';
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      inputEl.value = commandHistory[historyIndex] || '';
    } else {
      historyIndex = commandHistory.length;
      inputEl.value = '';
    }
  }
}

async function executeTerminalCommand(cmd) {
  if (isCommandExecuting) return;

  const outputEl = document.getElementById('terminal-output');
  const inputEl = document.getElementById('terminal-input');
  const runBtn = document.getElementById('btn-terminal-run');

  // Handle client-side commands
  if (cmd.toLowerCase() === 'clear') {
    clearTerminal();
    return;
  }

  if (cmd.toLowerCase() === 'help') {
    appendTerminalPrompt(cmd);
    appendTerminalLine(`Pulse UX Shell Help:
  - Type any standard Linux command (ip, iw, ping, dig, curl, traceroute, ps, df, free, journalctl)
  - Press Up/Down arrows to navigate recent command history
  - Type 'clear' to reset terminal window
  - Use the quick diagnostic preset buttons for instant 1-click status\n`);
    return;
  }

  appendTerminalPrompt(cmd);

  isCommandExecuting = true;
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="spinner-border spinner-border-sm" style="display:inline-block;width:12px;height:12px;border:2px solid #00f2fe;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></span> Running...`;
  }

  try {
    const data = await API.executeRemoteTerminal(activeTerminalSensorId, cmd);
    
    if (data.stdout) {
      appendTerminalLine(data.stdout, 'stdout');
    }
    if (data.stderr) {
      appendTerminalLine(data.stderr, 'stderr');
    }

    const durationText = data.duration_ms !== undefined ? `${data.duration_ms}ms` : 'fast';
    const statusText = data.exit_code === 0
      ? `<span style="color: #10b981;">[Exit 0 • ${durationText}]</span>`
      : `<span style="color: #f43f5e;">[Exit ${data.exit_code} • ${durationText}]</span>`;

    appendTerminalRawHtml(`<div class="term-status-line">${statusText}</div>`);
  } catch (err) {
    appendTerminalLine(`Error executing command: ${err.message}`, 'stderr');
  } finally {
    isCommandExecuting = false;
    if (runBtn) {
      runBtn.disabled = false;
      runBtn.innerHTML = `Execute`;
    }
    if (inputEl) {
      inputEl.focus();
    }
    // Auto-scroll
    if (outputEl) {
      outputEl.scrollTop = outputEl.scrollHeight;
    }
  }
}

function appendTerminalPrompt(cmd) {
  const outputEl = document.getElementById('terminal-output');
  if (!outputEl) return;

  const promptLine = document.createElement('div');
  promptLine.className = 'term-line term-prompt-line';
  promptLine.innerHTML = `<span class="term-prompt">mario@${activeTerminalSensorName || 'sensor'}:~$</span> <span class="term-cmd">${escapeHtml(cmd)}</span>`;
  outputEl.appendChild(promptLine);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function appendTerminalLine(text, type = 'stdout') {
  const outputEl = document.getElementById('terminal-output');
  if (!outputEl) return;

  const lineEl = document.createElement('pre');
  lineEl.className = `term-output ${type === 'stderr' ? 'term-stderr' : 'term-stdout'}`;
  lineEl.textContent = text;
  outputEl.appendChild(lineEl);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function appendTerminalRawHtml(html) {
  const outputEl = document.getElementById('terminal-output');
  if (!outputEl) return;

  const div = document.createElement('div');
  div.innerHTML = html;
  outputEl.appendChild(div);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

window.openRemoteTerminal = openRemoteTerminal;
window.closeRemoteTerminal = closeRemoteTerminal;
window.clearTerminal = clearTerminal;
window.initRemoteTerminal = initRemoteTerminal;
