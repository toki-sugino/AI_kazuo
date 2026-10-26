// 写真の保存（このPCのブラウザの中に保存する。ネットには公開されない）
(function () {
  'use strict';

  var DB = 'ai-kazuo', STORE = 'photos';
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var result;
        Promise.resolve(fn(tx.objectStore(STORE))).then(function (r) { result = r; });
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function reqP(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // 並び順（order）の小さい順に返す
  function list() {
    return run('readonly', function (s) { return reqP(s.getAll()); }).then(function (all) {
      return (all || []).sort(function (a, b) { return a.order - b.order || a.id - b.id; });
    });
  }

  function add(file) {
    return list().then(function (all) {
      var order = all.length ? all[all.length - 1].order + 1 : 1;
      return run('readwrite', function (s) {
        return reqP(s.add({ name: file.name || '写真', blob: file, order: order }));
      });
    });
  }

  function remove(id) {
    return run('readwrite', function (s) { return reqP(s.delete(id)); });
  }

  function get(id) {
    return run('readonly', function (s) { return reqP(s.get(id)); });
  }

  // 1つ前（dir=-1）または1つ後ろ（dir=+1）と入れ替える
  function move(id, dir) {
    return list().then(function (all) {
      var i = all.findIndex(function (p) { return p.id === id; });
      var j = i + dir;
      if (i < 0 || j < 0 || j >= all.length) return;
      var a = all[i], b = all[j], tmp = a.order;
      a.order = b.order; b.order = tmp;
      if (a.order === b.order) { a.order += dir; }
      return run('readwrite', function (s) { s.put(a); s.put(b); });
    });
  }

  window.Photos = { list: list, add: add, remove: remove, get: get, move: move };
})();
