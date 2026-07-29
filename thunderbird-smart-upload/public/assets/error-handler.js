console.log('[SmartUpload] Error handler initialized');
window.onerror = function(msg, url, lineNo, columnNo, error) {
  console.error('[SmartUpload Error]', msg, url, lineNo, columnNo, error);
  var root = document.getElementById('root');
  if (root) {
    root.innerHTML = '<div style="padding:20px;color:#dc2626;font-family:sans-serif;background:#ffffff;height:100%;box-sizing:border-box;">' +
      '<h3 style="margin-top:0;">JavaScript Error:</h3>' +
      '<p style="font-size:14px;color:#1e293b;"><b>' + msg + '</b></p>' +
      '<pre style="background:#f8fafc;padding:12px;border-radius:6px;font-size:12px;color:#991b1b;white-space:pre-wrap;word-break:break-all;border:1px solid #fca5a5;">' +
      (error && error.stack ? error.stack : ('File: ' + url + '\nLine: ' + lineNo + ':' + columnNo)) +
      '</pre></div>';
  }
  return false;
};

window.onunhandledrejection = function(e) {
  console.error('[SmartUpload Rejection]', e);
  var root = document.getElementById('root');
  if (root) {
    var errStr = e.reason && e.reason.stack ? e.reason.stack : (e.reason || String(e));
    root.innerHTML = '<div style="padding:20px;color:#dc2626;font-family:sans-serif;background:#ffffff;height:100%;box-sizing:border-box;">' +
      '<h3 style="margin-top:0;">Unhandled Rejection:</h3>' +
      '<pre style="background:#f8fafc;padding:12px;border-radius:6px;font-size:12px;color:#991b1b;white-space:pre-wrap;word-break:break-all;border:1px solid #fca5a5;">' +
      errStr +
      '</pre></div>';
  }
};
