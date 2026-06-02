'use strict';

/**
 * POST /api/license/revoke — Thu hồi session/license trước khi hết TTL
 *
 * Body: { session_id: string }   — Admin thu hồi session cụ thể
 *    hoặc { user_id: string }    — Admin thu hồi toàn bộ session của user
 *
 * Yêu cầu: JWT RS256 với role = 'admin'
 */

const express = require('express');
const router  = express.Router();
const { verifyRS256 } = require('../auth/jwt');

let _db = null;
function setDb(db) { _db = db; }

function requireAdmin(req, res, next) {
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Unauthorized: Thiếu token' });

    const { valid, decoded, error } = verifyRS256(header.split(' ')[1]);
    if (!valid)
        return res.status(401).json({ error: `Unauthorized: ${error}` });
    if (decoded.role !== 'admin')
        return res.status(403).json({ error: 'Forbidden: Chỉ admin mới được thu hồi license' });

    req.admin = decoded;
    next();
}

// POST /api/license/revoke
router.post('/', requireAdmin, async (req, res) => {
    const { session_id, user_id } = req.body ?? {};

    if (!session_id && !user_id)
        return res.status(400).json({ error: 'Cần cung cấp session_id hoặc user_id' });

    if (!_db) {
        return res.status(503).json({ error: 'Revocation cần kết nối MongoDB' });
    }

    try {
        let filter, description;

        if (session_id) {
            filter      = { session_id };
            description = `session ${session_id}`;
        } else {
            filter      = { user_id };
            description = `toàn bộ session của user ${user_id}`;
        }

        const result = await _db.collection('sessions').updateMany(
            { ...filter, is_revoked: false, expires_at: { $gt: new Date() } },
            { $set: { is_revoked: true, revoked_at: new Date(), revoked_by: req.admin.userId } }
        );

        if (result.matchedCount === 0)
            return res.status(404).json({ error: `Không tìm thấy session hợp lệ cho ${description}` });

        // Ghi audit log
        await _db.collection('licenses_audit').insertOne({
            event:          'LICENSE_REVOKED',
            revoked_by:     req.admin.userId,
            filter:         session_id ? { session_id } : { user_id },
            sessions_revoked: result.modifiedCount,
            created_at:     new Date(),
        });

        console.log(`[Revoke] ✅ ${req.admin.userId} thu hồi ${result.modifiedCount} session (${description})`);

        return res.json({
            message:          `Đã thu hồi ${result.modifiedCount} session`,
            sessions_revoked: result.modifiedCount,
        });

    } catch (err) {
        console.error('[Revoke] Lỗi:', err.message);
        return res.status(500).json({ error: 'Lỗi máy chủ: ' + err.message });
    }
});

// GET /api/license/revoke?user_id=xxx — Xem danh sách session bị revoke
router.get('/', requireAdmin, async (req, res) => {
    const { user_id } = req.query;

    if (!_db)
        return res.status(503).json({ error: 'Cần kết nối MongoDB' });

    try {
        const filter = { is_revoked: true };
        if (user_id) filter.user_id = user_id;

        const sessions = await _db.collection('sessions')
            .find(filter, { projection: { _id: 0 } })
            .sort({ revoked_at: -1 })
            .limit(100)
            .toArray();

        return res.json({ count: sessions.length, sessions });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

module.exports = { router, setDb };
