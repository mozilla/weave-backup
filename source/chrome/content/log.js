var Ci = Components.interfaces;
var Cc = Components.classes;
var Cr = Components.results;

let gSyncLog = {
  //////////////////////////////////////////////////////////////////////////////
  // Private Methods

  _file: function SyncLog__file(type) {
    let dirSvc = Cc["@mozilla.org/file/directory_service;1"].
      getService(Ci.nsIProperties);

    let logFile = dirSvc.get("ProfD", Ci.nsIFile);
    logFile.QueryInterface(Ci.nsILocalFile);
    logFile.append("weave");
    logFile.append("logs");
    logFile.append(type + "-log.txt");

    return logFile;
  },

  get _frame() {
    return document.getElementById("sync-log-frame");
  },

  get _stringBundle() {
    let stringBundle = document.getElementById("weaveStringBundle");
    delete this._stringBundle;
    return this._stringBundle = stringBundle;
  },

  _uriLog: function SyncLog__uriLog(type) {
    if (type) {
      let file = this._file(type);
      if (file.exists())
        return "file://" + file.path;
    }

    return "chrome://weave/content/default-log.txt";
  },

  //////////////////////////////////////////////////////////////////////////////
  // Event Handlers

  init: function SyncLog_init(event) {
    let frame = this._frame;
    let handleLoad = function SyncLog__handleLoad(event) {
      frame.removeEventListener("load", handleLoad, true);
      gSyncLog.onFrameLoad(event, frame);
    };
    frame.addEventListener("load", handleLoad, true);
    frame.setAttribute("src", this._uriLog("verbose"));
  },

  onFrameLoad: function SyncLog_onFrameLoad(event, frame) {
    let text = frame.contentDocument.documentElement.lastChild.textContent;
    let re = "\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\t([^\\s]+)\\s+([^\\s]+)\t.*";
    let matches = text.match(new RegExp(re, "g"));

    // No need to process the text if there's nothing to color
    if (!matches)
      return;

    // Define some colors for various levels/types of logging
    let textColors = {
      WARN:   "#f60",
      ERROR:  "#f30",
      FATAL:  "#f00",

      CONFIG: "#600",
      DEBUG:  "#060",
      INFO:   "#006",
      TRACE:  "#066",
    };

    let logPattern = new RegExp(re);
    // Color one line at a time on a timeout reverse-log-order
    let colorText = function SyncLog__colorText(doc, num) {
      // Stop processing if we're out of lines
      if (matches.length == 0)
        return;

      let [line, source, type] = matches.pop().match(logPattern);

      // Generate a background color based on the source of the log
      let bgColor = [0, 0, 0];
      for (let i = source.length; --i >= 0; ) {
        let code = source.charCodeAt(i) - 65;
        bgColor[i % 3] += code;
        bgColor[(i + code) % 3] += code;
      }
      bgColor = bgColor.map(function(v) Math.abs(v % 256));

      let pre = doc.body.appendChild(doc.createElement("pre"));
      pre.style.color = textColors[type];
      pre.style.backgroundColor = "rgba(" + bgColor + ", .2)";
      pre.appendChild(doc.createTextNode(line));

      // Color another line right away if we need to
      if (--num > 0)
        colorText(doc, num);
      // Wait a short bit before starting another batch
      else
        setTimeout(colorText, 0, doc, 50);
    };

    // The second frame load is for switching to html
    let handleHtmlLoad = function SyncLog__handleHtmlLoad(event) {
      frame.removeEventListener("load", handleHtmlLoad, true);
      colorText(event.target, 100);
    };
    frame.addEventListener("load", handleHtmlLoad, true);

    let html = "<html><head><style>pre{margin:0}</style><body></body></html>";
    frame.setAttribute("src", "data:text/html," + html);
  },

  //////////////////////////////////////////////////////////////////////////////
  // Public Methods

  saveAs: function SyncLog_saveAs() {
    let file = this._file("verbose");

    if (!file.exists()) {
      alert(this._stringBundle.getString("noLogAvailable.alert"));
      return;
    }

    let dirSvc = Cc["@mozilla.org/file/directory_service;1"].
      getService(Ci.nsIProperties);
    let backupsDir = dirSvc.get("Desk", Ci.nsILocalFile);
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    let filePickerTitle = this._stringBundle.getString("filePicker.title");
    fp.init(window, filePickerTitle, Ci.nsIFilePicker.modeSave);
    fp.appendFilters(Ci.nsIFilePicker.filterAll);
    fp.displayDirectory = backupsDir;
    fp.defaultString = "Weave Sync.log";

    if (fp.show() != Ci.nsIFilePicker.returnCancel) {
      if (fp.file.exists())
        fp.file.remove(false);
      file.copyTo(fp.file.parent, fp.file.leafName);
    }
  },

  clear: function SyncLog_clear() {
    Weave.Service.clearLogs();
    this._frame.setAttribute("src", this._uriLog());
  }
}

window.addEventListener("load", function(e) gSyncLog.init(e), false);
