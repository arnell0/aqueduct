const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const database = new sqlite3.Database(path.join(__dirname, 'db.sqlite'));

const db = {
    init: () => {
        database.serialize(() => {
            database.run('CREATE TABLE IF NOT EXISTS store(id INTEGER PRIMARY KEY AUTOINCREMENT, key STRING, value BLOB)');
        });
    },
    store: {
        get: (key) => {
            return new Promise((resolve, reject) => {
                database.get('SELECT value FROM store WHERE key = ?', key, (err, row) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(row ? row.value : null);
                    }
                });
            });
        },
        set: (key, value) => {
            return new Promise((resolve, reject) => {
                database.run('INSERT OR REPLACE INTO store(key, value) VALUES(?, ?)', key, value, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        },
        delete: (key) => {
            return new Promise((resolve, reject) => {
                database.run('DELETE FROM store WHERE key = ?', key, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        },
    }
}


module.exports = { db }