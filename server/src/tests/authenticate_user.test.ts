import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { authenticateUser } from '../handlers/authenticate_user';
import { createHash, randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';

// Simple password hashing function using Node.js crypto (matching the handler logic)
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

// Simple token verification function
function verifyToken(token: string): any {
  try {
    const [header, payload, signature] = token.split('.');
    if (!header || !payload || !signature) return null;
    
    const secret = process.env['JWT_SECRET'] || 'default-secret-key';
    const expectedSignature = createHash('sha256').update(`${header}.${payload}.${secret}`).digest('base64url');
    
    if (signature !== expectedSignature) return null;
    
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}

describe('authenticateUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  const testEmail = 'admin@restaurant.com';
  const testPassword = 'password123';
  let testUserId: number;

  beforeEach(async () => {
    // Create a test user with hashed password
    const hashedPassword = hashPassword(testPassword);
    const result = await db.insert(usersTable)
      .values({
        email: testEmail,
        phone: '+1234567890',
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        password_hash: hashedPassword,
        is_active: true
      })
      .returning()
      .execute();
    
    testUserId = result[0].id;
  });

  it('should authenticate user with valid credentials', async () => {
    const result = await authenticateUser(testEmail, testPassword);

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.token).toBeDefined();
    expect(result.error).toBeUndefined();

    // Verify user data
    expect(result.user!.email).toEqual(testEmail);
    expect(result.user!.first_name).toEqual('Admin');
    expect(result.user!.last_name).toEqual('User');
    expect(result.user!.role).toEqual('admin');
    expect(result.user!.is_active).toBe(true);
    expect(result.user!.id).toBeDefined();

    // Ensure password hash is not returned (should be null)
    expect(result.user!.password_hash).toBeNull();
  });

  it('should verify token contains correct payload', async () => {
    const result = await authenticateUser(testEmail, testPassword);

    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();

    // Decode and verify token
    const decoded = verifyToken(result.token!);
    expect(decoded).not.toBeNull();

    expect(decoded.userId).toEqual(result.user!.id);
    expect(decoded.email).toEqual(testEmail);
    expect(decoded.role).toEqual('admin');
    expect(decoded.iss).toEqual('restaurant-pos');
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should reject authentication with invalid email', async () => {
    const result = await authenticateUser('nonexistent@restaurant.com', testPassword);

    expect(result.success).toBe(false);
    expect(result.user).toBeUndefined();
    expect(result.token).toBeUndefined();
    expect(result.error).toEqual('Invalid email or password');
  });

  it('should reject authentication with invalid password', async () => {
    const result = await authenticateUser(testEmail, 'wrongpassword');

    expect(result.success).toBe(false);
    expect(result.user).toBeUndefined();
    expect(result.token).toBeUndefined();
    expect(result.error).toEqual('Invalid email or password');
  });

  it('should reject authentication for inactive user', async () => {
    // Deactivate the user
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.email, testEmail))
      .execute();

    const result = await authenticateUser(testEmail, testPassword);

    expect(result.success).toBe(false);
    expect(result.user).toBeUndefined();
    expect(result.token).toBeUndefined();
    expect(result.error).toEqual('Account is deactivated');
  });

  it('should reject authentication for user without password hash', async () => {
    // Create user without password hash (guest user)
    const guestEmail = 'guest@restaurant.com';
    await db.insert(usersTable)
      .values({
        email: guestEmail,
        phone: '+1987654321',
        first_name: 'Guest',
        last_name: 'User',
        role: 'employee',
        password_hash: null,
        is_active: true
      })
      .execute();

    const result = await authenticateUser(guestEmail, 'anypassword');

    expect(result.success).toBe(false);
    expect(result.user).toBeUndefined();
    expect(result.token).toBeUndefined();
    expect(result.error).toEqual('Account not set up for authentication');
  });

  it('should authenticate manager user with correct role', async () => {
    // Create manager user
    const managerEmail = 'manager@restaurant.com';
    const managerPassword = 'manager123';
    const hashedPassword = hashPassword(managerPassword);
    
    await db.insert(usersTable)
      .values({
        email: managerEmail,
        phone: '+1555666777',
        first_name: 'Manager',
        last_name: 'User',
        role: 'manager',
        password_hash: hashedPassword,
        is_active: true
      })
      .execute();

    const result = await authenticateUser(managerEmail, managerPassword);

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user!.role).toEqual('manager');
    expect(result.token).toBeDefined();

    // Verify token contains manager role
    const decoded = verifyToken(result.token!);
    expect(decoded.role).toEqual('manager');
  });

  it('should authenticate employee user with correct role', async () => {
    // Create employee user
    const employeeEmail = 'employee@restaurant.com';
    const employeePassword = 'employee123';
    const hashedPassword = hashPassword(employeePassword);
    
    await db.insert(usersTable)
      .values({
        email: employeeEmail,
        phone: '+1444555666',
        first_name: 'Employee',
        last_name: 'User',
        role: 'employee',
        password_hash: hashedPassword,
        is_active: true
      })
      .execute();

    const result = await authenticateUser(employeeEmail, employeePassword);

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user!.role).toEqual('employee');
    expect(result.token).toBeDefined();

    // Verify token contains employee role
    const decoded = verifyToken(result.token!);
    expect(decoded.role).toEqual('employee');
  });

  it('should handle case-sensitive email authentication', async () => {
    // Try with different case
    const result = await authenticateUser(testEmail.toUpperCase(), testPassword);

    expect(result.success).toBe(false);
    expect(result.error).toEqual('Invalid email or password');
  });

  it('should handle empty credentials', async () => {
    const result1 = await authenticateUser('', testPassword);
    expect(result1.success).toBe(false);
    expect(result1.error).toEqual('Invalid email or password');

    const result2 = await authenticateUser(testEmail, '');
    expect(result2.success).toBe(false);
    expect(result2.error).toEqual('Invalid email or password');

    const result3 = await authenticateUser('', '');
    expect(result3.success).toBe(false);
    expect(result3.error).toEqual('Invalid email or password');
  });

  it('should handle malformed password hash in database', async () => {
    // Create user with malformed password hash
    const malformedEmail = 'malformed@restaurant.com';
    await db.insert(usersTable)
      .values({
        email: malformedEmail,
        phone: '+1999888777',
        first_name: 'Malformed',
        last_name: 'User',
        role: 'employee',
        password_hash: 'invalid-hash-format', // Missing salt:hash format
        is_active: true
      })
      .execute();

    const result = await authenticateUser(malformedEmail, 'anypassword');

    expect(result.success).toBe(false);
    expect(result.error).toEqual('Invalid email or password');
  });

  it('should verify token expiration time is set correctly', async () => {
    const beforeAuth = Math.floor(Date.now() / 1000);
    const result = await authenticateUser(testEmail, testPassword);
    const afterAuth = Math.floor(Date.now() / 1000);

    expect(result.success).toBe(true);
    expect(result.token).toBeDefined();

    const decoded = verifyToken(result.token!);
    expect(decoded).not.toBeNull();
    expect(decoded.exp).toBeGreaterThanOrEqual(beforeAuth + (24 * 60 * 60) - 1);
    expect(decoded.exp).toBeLessThanOrEqual(afterAuth + (24 * 60 * 60) + 1);
  });
});