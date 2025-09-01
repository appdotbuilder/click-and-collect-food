import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type User } from '../schema';

export const createUser = async (input: CreateUserInput): Promise<User> => {
  try {
    // Hash password if provided (using Bun's built-in password hashing)
    let passwordHash: string | null = null;
    if (input.password) {
      passwordHash = await Bun.password.hash(input.password);
    }

    // Insert user record
    const result = await db.insert(usersTable)
      .values({
        email: input.email,
        phone: input.phone,
        first_name: input.first_name,
        last_name: input.last_name,
        role: input.role, // Zod has already applied default 'employee'
        password_hash: passwordHash,
        is_active: true // Default to active
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
};