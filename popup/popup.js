// popup.js — controls the extension popup window

window.onload = function () {
  updateBlockedWebsitesSection();
  loadApiKeyStatus();
  loadPromptTemplate();

  document.getElementById("blockButton").onclick    = getWebsiteInput;
  document.getElementById("saveApiKeyBtn").onclick  = saveApiKey;
  document.getElementById("savePromptBtn").onclick  = savePromptTemplate;
  document.getElementById("resetPromptBtn").onclick = resetPromptTemplate;
};

// ── Add / Remove Sites ────────────────────────────────────────

function getWebsiteInput() {
  const websiteInput = document.getElementById("websiteInput").value.trim();
  if (!websiteInput) {
    alert("Error: please enter a website URL");
    return;
  }
  chrome.storage.sync.get("blockedWebsitesArray", (data) => {
    const arr = data.blockedWebsitesArray || [];
    if (arr.some((item) => item === websiteInput)) {
      alert("Error: URL is already blocked");
      return;
    }
    arr.push(websiteInput);
    chrome.storage.sync.set({ blockedWebsitesArray: arr }, () => {
      updateBlockedWebsitesSection();
      document.getElementById("websiteInput").value = "";
      document.getElementById("websiteInput").focus();
    });
  });
}

function unblockURL(index) {
  chrome.storage.sync.get("blockedWebsitesArray", (data) => {
    const arr = data.blockedWebsitesArray || [];
    arr.splice(index, 1);
    chrome.storage.sync.set({ blockedWebsitesArray: arr }, updateBlockedWebsitesSection);
  });
}

// ── Blocked Websites Section ──────────────────────────────────

function updateBlockedWebsitesSection() {
  const container = document.getElementById("blockedWebsitesDiv");
  while (container.firstChild) container.removeChild(container.firstChild);

  chrome.storage.sync.get(["blockedWebsitesArray", "blockingSchedules"], (syncData) => {
    const sites     = syncData.blockedWebsitesArray || [];
    const schedules = syncData.blockingSchedules    || {};

    chrome.runtime.sendMessage({ type: "GET_SITE_PROMPTS" }, (promptData) => {
      const customPrompts = promptData?.sitePrompts || {};

      chrome.runtime.sendMessage({ type: "GET_ALL_DEFAULTS" }, (defaultData) => {
        const defaultPrompts = defaultData?.defaults || {};

        if (sites.length === 0) {
          const empty = document.createElement("div");
          empty.textContent = "No websites have been blocked";
          empty.className   = "mlp-nothing";
          container.appendChild(empty);
          return;
        }

        sites.forEach((site, index) => {
          const hasCustom      = !!customPrompts[site];
          const effectivePrompt = customPrompts[site] || defaultPrompts[site] || "";
          const defaultPrompt  = defaultPrompts[site] || "";
          const siteKey        = site.replace(/^www\./, "");
          const schedule       = schedules[siteKey] || schedules[site] || null;

          const siteContainer = document.createElement("div");
          siteContainer.className = "mlp-site-container";

          // ── Top row ──
          const topRow = document.createElement("div");
          topRow.className = "mlp-site-row";

          // Site name
          const nameEl = document.createElement("span");
          nameEl.className = "mlp-site-name";
          nameEl.textContent = site;
          nameEl.title = site;
          topRow.appendChild(nameEl);

          // "custom" badge
          if (hasCustom) {
            const badge = document.createElement("span");
            badge.className   = "mlp-custom-badge";
            badge.textContent = "custom";
            badge.title       = "This site has a custom meme prompt";
            topRow.appendChild(badge);
          }

          // Schedule badge
          if (schedule) {
            const sbadge = document.createElement("span");
            sbadge.className   = "mlp-schedule-badge";
            sbadge.textContent = formatScheduleBadge(schedule);
            sbadge.title       = "Custom blocking schedule is active";
            topRow.appendChild(sbadge);
          }

          // Prompt editor toggle (✏️)
          const editBtn = document.createElement("button");
          editBtn.className = "mlp-btn-icon";
          editBtn.title     = "Edit meme prompt";
          editBtn.textContent = "✏";
          editBtn.addEventListener("click", () =>
            toggleEditor(siteContainer, "prompt-editor")
          );
          topRow.appendChild(editBtn);

          // Schedule editor toggle (🕐)
          const schedBtn = document.createElement("button");
          schedBtn.className   = "mlp-btn-icon";
          schedBtn.title       = "Set blocking schedule";
          schedBtn.textContent = "⏰";
          schedBtn.addEventListener("click", () =>
            toggleEditor(siteContainer, "schedule-editor")
          );
          topRow.appendChild(schedBtn);

          // Delete button
          const delBtn = document.createElement("button");
          delBtn.className   = "mlp-btn-danger";
          delBtn.title       = "Remove from block list";
          delBtn.textContent = "✕";
          delBtn.addEventListener("click", () => unblockURL(index));
          topRow.appendChild(delBtn);

          siteContainer.appendChild(topRow);

          // ── Prompt editor ──
          const promptEditor = buildPromptEditor(site, effectivePrompt, defaultPrompt, siteContainer);
          promptEditor.dataset.editorType = "prompt-editor";
          siteContainer.appendChild(promptEditor);

          // ── Schedule editor ──
          const schedEditor = buildScheduleEditor(siteKey, schedule, siteContainer);
          schedEditor.dataset.editorType = "schedule-editor";
          siteContainer.appendChild(schedEditor);

          container.appendChild(siteContainer);
        });
      });
    });
  });
}

function toggleEditor(siteContainer, editorType) {
  const editors = siteContainer.querySelectorAll(".mlp-editor");
  editors.forEach((ed) => {
    if (ed.dataset.editorType === editorType) {
      ed.classList.toggle("open");
      if (ed.classList.contains("open")) {
        const firstInput = ed.querySelector("textarea, input");
        if (firstInput) firstInput.focus();
      }
    } else {
      ed.classList.remove("open");
    }
  });
}

function formatScheduleBadge(schedule) {
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const days = (schedule.days || []).map((d) => dayNames[d]).join("");
  const t = schedule.startTime && schedule.endTime
    ? ` ${schedule.startTime}–${schedule.endTime}`
    : "";
  return `⏰${days}${t}`;
}

// ── Prompt Editor ─────────────────────────────────────────────

function buildPromptEditor(site, effectivePrompt, defaultPrompt, siteContainer) {
  const editor = document.createElement("div");
  editor.className = "mlp-editor";

  const label = document.createElement("div");
  label.className   = "mlp-editor-label";
  label.textContent = "Meme prompt for this site:";
  editor.appendChild(label);

  const textarea = document.createElement("textarea");
  textarea.value       = effectivePrompt;
  textarea.placeholder = "Enter a custom Shark Tank meme prompt for this site…";
  editor.appendChild(textarea);

  const btnRow = document.createElement("div");
  btnRow.className = "mlp-editor-btn-row";

  const saveBtn = document.createElement("button");
  saveBtn.className   = "mlp-btn-primary";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () =>
    saveCustomPrompt(site, textarea.value, statusEl, siteContainer)
  );
  btnRow.appendChild(saveBtn);

  const resetBtn = document.createElement("button");
  resetBtn.className   = "mlp-btn-secondary";
  resetBtn.textContent = "Reset";
  resetBtn.title       = "Revert to built-in Shark Tank prompt";
  resetBtn.addEventListener("click", () =>
    resetToDefaultPrompt(site, textarea, defaultPrompt, statusEl, siteContainer)
  );
  btnRow.appendChild(resetBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.className   = "mlp-btn-secondary";
  cancelBtn.textContent = "✕";
  cancelBtn.title       = "Cancel";
  cancelBtn.addEventListener("click", () => editor.classList.remove("open"));
  btnRow.appendChild(cancelBtn);

  editor.appendChild(btnRow);

  const statusEl = document.createElement("p");
  statusEl.className = "mlp-editor-status";
  editor.appendChild(statusEl);

  return editor;
}

function saveCustomPrompt(site, promptText, statusEl, siteContainer) {
  chrome.runtime.sendMessage(
    { type: "UPDATE_SITE_PROMPT", hostname: site, prompt: promptText },
    (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        statusEl.textContent = "Failed to save.";
        statusEl.className   = "mlp-editor-status st-err";
        return;
      }
      statusEl.textContent = "Saved — new meme on next visit.";
      statusEl.className   = "mlp-editor-status st-ok";
      setTimeout(updateBlockedWebsitesSection, 700);
    }
  );
}

function resetToDefaultPrompt(site, textarea, defaultPrompt, statusEl, siteContainer) {
  chrome.runtime.sendMessage(
    { type: "UPDATE_SITE_PROMPT", hostname: site, prompt: "" },
    (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        statusEl.textContent = "Failed to reset.";
        statusEl.className   = "mlp-editor-status st-err";
        return;
      }
      textarea.value       = defaultPrompt;
      statusEl.textContent = "Reset to default prompt.";
      statusEl.className   = "mlp-editor-status st-ok";
      setTimeout(updateBlockedWebsitesSection, 700);
    }
  );
}

// ── Schedule Editor ───────────────────────────────────────────

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function buildScheduleEditor(siteKey, schedule, siteContainer) {
  const editor = document.createElement("div");
  editor.className = "mlp-editor";

  const label = document.createElement("div");
  label.className   = "mlp-editor-label";
  label.textContent = "Blocking schedule (default: 24/7):";
  editor.appendChild(label);

  // Days row
  const daysLabel = document.createElement("div");
  daysLabel.className   = "mlp-editor-label";
  daysLabel.textContent = "Days:";
  editor.appendChild(daysLabel);

  const activeDays = schedule?.days ?? [0, 1, 2, 3, 4, 5, 6];
  const checkboxes = [];
  const daysRow    = document.createElement("div");
  daysRow.className = "mlp-days-row";
  DAY_LABELS.forEach((day, i) => {
    const lbl = document.createElement("label");
    lbl.className = "mlp-day-check";
    const cb = document.createElement("input");
    cb.type    = "checkbox";
    cb.checked = activeDays.includes(i);
    checkboxes.push(cb);
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(day));
    daysRow.appendChild(lbl);
  });
  editor.appendChild(daysRow);

  // Time range row
  const timeLabel = document.createElement("div");
  timeLabel.className   = "mlp-editor-label";
  timeLabel.textContent = "Active hours:";
  editor.appendChild(timeLabel);

  const timeRow = document.createElement("div");
  timeRow.className = "mlp-schedule-row";

  const startInput = document.createElement("input");
  startInput.type  = "time";
  startInput.value = schedule?.startTime ?? "00:00";
  startInput.title = "Start time";

  const toLabel = document.createElement("span");
  toLabel.className   = "mlp-schedule-label";
  toLabel.textContent = "to";
  toLabel.style.textAlign = "center";
  toLabel.style.width = "20px";

  const endInput = document.createElement("input");
  endInput.type  = "time";
  endInput.value = schedule?.endTime ?? "23:59";
  endInput.title = "End time";

  timeRow.appendChild(startInput);
  timeRow.appendChild(toLabel);
  timeRow.appendChild(endInput);
  editor.appendChild(timeRow);

  // Hint
  const hint = document.createElement("p");
  hint.className   = "mlp-hint";
  hint.textContent = "Leave 00:00–23:59 with all days checked to block 24/7.";
  editor.appendChild(hint);

  // Buttons
  const btnRow = document.createElement("div");
  btnRow.className = "mlp-editor-btn-row";

  const saveBtn = document.createElement("button");
  saveBtn.className   = "mlp-btn-primary";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => {
    const selectedDays = checkboxes
      .map((cb, i) => (cb.checked ? i : -1))
      .filter((i) => i >= 0);
    saveSchedule(siteKey, {
      days:      selectedDays,
      startTime: startInput.value,
      endTime:   endInput.value,
    }, schedStatusEl);
  });
  btnRow.appendChild(saveBtn);

  const clearBtn = document.createElement("button");
  clearBtn.className   = "mlp-btn-secondary";
  clearBtn.textContent = "Clear (24/7)";
  clearBtn.title       = "Remove schedule — site will be blocked 24/7";
  clearBtn.addEventListener("click", () => clearSchedule(siteKey, schedStatusEl));
  btnRow.appendChild(clearBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.className   = "mlp-btn-secondary";
  cancelBtn.textContent = "✕";
  cancelBtn.addEventListener("click", () => editor.classList.remove("open"));
  btnRow.appendChild(cancelBtn);

  editor.appendChild(btnRow);

  const schedStatusEl = document.createElement("p");
  schedStatusEl.className = "mlp-editor-status";
  editor.appendChild(schedStatusEl);

  return editor;
}

function saveSchedule(siteKey, schedule, statusEl) {
  chrome.storage.sync.get("blockingSchedules", (data) => {
    const schedules   = data.blockingSchedules || {};
    schedules[siteKey] = schedule;
    chrome.storage.sync.set({ blockingSchedules: schedules }, () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Failed to save schedule.";
        statusEl.className   = "mlp-editor-status st-err";
        return;
      }
      statusEl.textContent = "Schedule saved.";
      statusEl.className   = "mlp-editor-status st-ok";
      setTimeout(updateBlockedWebsitesSection, 700);
    });
  });
}

function clearSchedule(siteKey, statusEl) {
  chrome.storage.sync.get("blockingSchedules", (data) => {
    const schedules = data.blockingSchedules || {};
    delete schedules[siteKey];
    chrome.storage.sync.set({ blockingSchedules: schedules }, () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = "Failed to clear schedule.";
        statusEl.className   = "mlp-editor-status st-err";
        return;
      }
      statusEl.textContent = "Cleared — site now blocked 24/7.";
      statusEl.className   = "mlp-editor-status st-ok";
      setTimeout(updateBlockedWebsitesSection, 700);
    });
  });
}

// ── API Key Management ────────────────────────────────────────

function loadApiKeyStatus() {
  chrome.runtime.sendMessage({ type: "GET_API_KEY_STATUS" }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    const statusEl = document.getElementById("apiKeyStatus");
    if (response.hasKey) {
      statusEl.textContent = "Key saved: " + response.maskedKey;
      statusEl.className   = "st-ok";
    } else {
      statusEl.textContent = "No API key saved yet.";
      statusEl.className   = "st-err";
    }
  });
}

function saveApiKey() {
  const input    = document.getElementById("apiKeyInput");
  const apiKey   = input.value.trim();
  const statusEl = document.getElementById("apiKeyStatus");

  if (!apiKey) {
    statusEl.textContent = "Please enter an API key.";
    statusEl.className   = "st-err";
    return;
  }
  if (!apiKey.startsWith("mlord_")) {
    statusEl.textContent = "Invalid key format — keys start with mlord_";
    statusEl.className   = "st-err";
    return;
  }

  chrome.runtime.sendMessage({ type: "UPDATE_API_KEY", apiKey }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      statusEl.textContent = "Failed to save key. Try again.";
      statusEl.className   = "st-err";
      return;
    }
    input.value          = "";
    statusEl.textContent = "Key saved successfully!";
    statusEl.className   = "st-ok";
    setTimeout(loadApiKeyStatus, 700);
  });
}

// ── Global Prompt Template ────────────────────────────────────

function loadPromptTemplate() {
  chrome.runtime.sendMessage({ type: "GET_PROMPT_TEMPLATE" }, (response) => {
    if (chrome.runtime.lastError || !response) return;
    const textarea = document.getElementById("promptTemplateInput");
    const statusEl = document.getElementById("promptStatus");
    if (response.template?.trim()) {
      textarea.value       = response.template;
      statusEl.textContent = "Custom global template active.";
      statusEl.className   = "st-ok";
    } else {
      textarea.value       = "";
      statusEl.textContent = "Using built-in Shark Tank prompts (no override set).";
      statusEl.className   = "st-neutral";
    }
  });
}

function savePromptTemplate() {
  const template = document.getElementById("promptTemplateInput").value.trim();
  const statusEl = document.getElementById("promptStatus");
  if (!template) {
    statusEl.textContent = "Nothing to save. Use Reset to clear a saved template.";
    statusEl.className   = "st-err";
    return;
  }
  chrome.runtime.sendMessage({ type: "UPDATE_PROMPT_TEMPLATE", template }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      statusEl.textContent = "Failed to save. Try again.";
      statusEl.className   = "st-err";
      return;
    }
    statusEl.textContent = "Global template saved!";
    statusEl.className   = "st-ok";
  });
}

function resetPromptTemplate() {
  const statusEl = document.getElementById("promptStatus");
  chrome.runtime.sendMessage({ type: "UPDATE_PROMPT_TEMPLATE", template: "" }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      statusEl.textContent = "Failed to reset. Try again.";
      statusEl.className   = "st-err";
      return;
    }
    document.getElementById("promptTemplateInput").value = "";
    statusEl.textContent = "Reset — using built-in Shark Tank prompts.";
    statusEl.className   = "st-neutral";
  });
}
