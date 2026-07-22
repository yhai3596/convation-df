// 极简 SQLite 会话存储（避免引入过时的第三方 store）
const session = require('express-session');

module.exports = function makeStore(db) {
  const stGet = db.prepare('SELECT sess, expire FROM sessions WHERE sid=?');
  const stSet = db.prepare('INSERT INTO sessions(sid,sess,expire) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire');
  const stDel = db.prepare('DELETE FROM sessions WHERE sid=?');
  const stTouch = db.prepare('UPDATE sessions SET expire=? WHERE sid=?');
  const stClean = db.prepare('DELETE FROM sessions WHERE expire < ?');

  class SQLiteStore extends session.Store {
    get(sid, cb) {
      try {
        const r = stGet.get(sid);
        if (!r || r.expire < Date.now()) return cb(null, null);
        cb(null, JSON.parse(r.sess));
      } catch (e) { cb(e); }
    }
    set(sid, sess, cb) {
      try {
        const maxAge = (sess.cookie && sess.cookie.maxAge) || 7 * 864e5;
        stSet.run(sid, JSON.stringify(sess), Date.now() + maxAge);
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }
    destroy(sid, cb) {
      try { stDel.run(sid); cb && cb(null); } catch (e) { cb && cb(e); }
    }
    touch(sid, sess, cb) {
      try {
        const maxAge = (sess.cookie && sess.cookie.maxAge) || 7 * 864e5;
        stTouch.run(Date.now() + maxAge, sid);
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    }
  }

  setInterval(() => { try { stClean.run(Date.now()); } catch (_) { /* noop */ } }, 3600e3).unref();
  return new SQLiteStore();
};
