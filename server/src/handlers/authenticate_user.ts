import { db } from '../db';
import { usersTable } from '../db/schema';
import { type User } from '../schema';
import { eq } from 'drizzle-orm';
import { createHash, timingSafeEqual, randomBytes } from 'crypto';

// Simple password verification using Node.js crypto
function verifyPassword(password: string, hashedPassword: string): boolean {
  try {
    // Split the stored hash into salt and hash
    const [salt, hash] = hashedPassword.split(':');
    if (!salt || !hash) return false;
    
    // Hash the provided password with the same salt
    const passwordHash = createHash('sha256').update(password + salt).digest('hex');
    
    // Use timing-safe comparison to prevent timing attacks
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(passwordHash, 'hex'));
  } catch {
    return false;
  }
}

// Simple JWT-like token generation using Node.js crypto
function generateToken(payload: { userId: number; email: string; role: string }): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
  const payloadStr = Buffer.from(JSON.stringify({
    ...payload,
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
    iss: 'restaurant-pos'
  })).toString('base64url');
  
  const secret = process.env['JWT_SECRET'] || 'default-secret-key';
  const signature = createHash('sha256').update(`${header}.${payloadStr}.${secret}`).digest('base64url');
  
  return `${header}.${payloadStr}.${signature}`;
}

export async function authenticateUser(email: string, password: string): Promise<{ success: boolean; user?: User; token?: string; error?: string }> {
  try {
    // Validate input
    if (!email || !password) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .execute();

    if (users.length === 0) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      return {
        success: false,
        error: 'Account is deactivated'
      };
    }

    // Check if user has a password hash (required for authentication)
    if (!user.password_hash) {
      return {
        success: false,
        error: 'Account not set up for authentication'
      };
    }

    // Verify password
    const passwordMatch = verifyPassword(password, user.password_hash);
    if (!passwordMatch) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Return user without password hash - explicitly construct User type
    const authenticatedUser: User = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      password_hash: null, // Don't expose password hash
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    return {
      success: true,
      user: authenticatedUser,
      token
    };
  } catch (error) {
    console.error('Authentication failed:', error);
    return {
      success: false,
      error: 'Authentication failed'
    };
  }
}