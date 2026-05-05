/**
 * T1.5: jwt.test.js — Unit Test cho module JWT (HS256 + RS256)
 * 
 * Chạy: npx jest
 * Hoặc: node --test (Node 18+)
 */

'use strict';

const { issueHS256, verifyHS256, issueRS256, verifyRS256 } = require('../src/auth/jwt');

// ==================================================================
// TEST GROUP 1: HS256
// ==================================================================
describe('JWT HS256', () => {

    test('Cấp token HS256 thành công', () => {
        const token = issueHS256({ userId: 'user_001', role: 'premium' });
        expect(typeof token).toBe('string');
        expect(token.split('.').length).toBe(3); // header.payload.signature
    });

    test('Verify token HS256 hợp lệ', () => {
        const token = issueHS256({ userId: 'user_001', entitlements: ['movie_123'] });
        const result = verifyHS256(token);
        expect(result.valid).toBe(true);
        expect(result.decoded.userId).toBe('user_001');
        expect(result.decoded.entitlements).toContain('movie_123');
    });

    test('Verify token HS256 bị giả mạo (chữ ký sai) → từ chối', () => {
        const token = issueHS256({ userId: 'user_001' });
        // Sửa ký tự cuối để phá chữ ký
        const tampered = token.slice(0, -4) + 'XXXX';
        const result = verifyHS256(tampered);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    test('Token HS256 hết hạn → bị từ chối', async () => {
        const token = issueHS256({ userId: 'user_001' }, '1ms'); // hết hạn ngay
        await new Promise(r => setTimeout(r, 10)); // chờ 10ms
        const result = verifyHS256(token);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/expired/i);
    });

    test('Token HS256 chứa jti (nonce) duy nhất', () => {
        const t1 = issueHS256({ userId: 'u1' });
        const t2 = issueHS256({ userId: 'u1' });
        const d1 = verifyHS256(t1).decoded;
        const d2 = verifyHS256(t2).decoded;
        expect(d1.jti).toBeDefined();
        expect(d2.jti).toBeDefined();
        expect(d1.jti).not.toBe(d2.jti); // mỗi token có jti khác nhau → chặn Replay
    });
});

// ==================================================================
// TEST GROUP 2: RS256
// ==================================================================
describe('JWT RS256', () => {

    test('Cấp token RS256 thành công', () => {
        const token = issueRS256({ userId: 'user_002', role: 'premium' });
        expect(typeof token).toBe('string');
        expect(token.split('.').length).toBe(3);
    });

    test('Verify token RS256 hợp lệ', () => {
        const token = issueRS256({ userId: 'user_002', entitlements: ['movie_456'] });
        const result = verifyRS256(token);
        expect(result.valid).toBe(true);
        expect(result.decoded.userId).toBe('user_002');
    });

    test('Token RS256 ký bởi HS256 → bị từ chối (thuật toán không khớp)', () => {
        const wrongToken = issueHS256({ userId: 'attacker' });
        const result = verifyRS256(wrongToken);
        expect(result.valid).toBe(false);
    });

    test('Verify token RS256 bị giả mạo → từ chối', () => {
        const token = issueRS256({ userId: 'user_002' });
        const tampered = token.slice(0, -4) + 'XXXX';
        const result = verifyRS256(tampered);
        expect(result.valid).toBe(false);
    });

    test('Token RS256 hết hạn → bị từ chối', async () => {
        const token = issueRS256({ userId: 'user_002' }, '1ms');
        await new Promise(r => setTimeout(r, 10));
        const result = verifyRS256(token);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/expired/i);
    });

    test('Token RS256 chứa jti duy nhất', () => {
        const t1 = issueRS256({ userId: 'u2' });
        const t2 = issueRS256({ userId: 'u2' });
        const d1 = verifyRS256(t1).decoded;
        const d2 = verifyRS256(t2).decoded;
        expect(d1.jti).not.toBe(d2.jti);
    });
});
