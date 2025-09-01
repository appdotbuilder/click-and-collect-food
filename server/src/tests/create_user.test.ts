import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput } from '../schema';
import { createUser } from '../handlers/create_user';
import { eq } from 'drizzle-orm';

// Test input with all required fields
const testInput: CreateUserInput = {
  email: 'test@example.com',
  phone: '555-0123',
  first_name: 'John',
  last_name: 'Doe',
  role: 'manager',
  password: 'securePassword123'
};

describe('createUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user with all fields', async () => {
    const result = await createUser(testInput);

    // Verify all fields are properly set
    expect(result.email).toEqual('test@example.com');
    expect(result.phone).toEqual('555-0123');
    expect(result.first_name).toEqual('John');
    expect(result.last_name).toEqual('Doe');
    expect(result.role).toEqual('manager');
    expect(result.is_active).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.password_hash).toBeTypeOf('string');
    expect(result.password_hash).not.toBeNull();
  });

  it('should hash the password correctly', async () => {
    const result = await createUser(testInput);

    // Verify password is hashed and can be verified
    expect(result.password_hash).not.toEqual('securePassword123');
    
    const isPasswordValid = await Bun.password.verify('securePassword123', result.password_hash!);
    expect(isPasswordValid).toBe(true);
  });

  it('should save user to database', async () => {
    const result = await createUser(testInput);

    // Query database to verify user was saved
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    expect(users[0].email).toEqual('test@example.com');
    expect(users[0].phone).toEqual('555-0123');
    expect(users[0].first_name).toEqual('John');
    expect(users[0].last_name).toEqual('Doe');
    expect(users[0].role).toEqual('manager');
    expect(users[0].is_active).toBe(true);
    expect(users[0].created_at).toBeInstanceOf(Date);
    expect(users[0].updated_at).toBeInstanceOf(Date);
  });

  it('should use default role when not specified', async () => {
    // Create input that would use Zod's default role parsing
    const inputData = {
      email: 'employee@example.com',
      phone: '555-0124',
      first_name: 'Jane',
      last_name: 'Smith',
      password: 'password123'
    };

    // Parse with Zod schema to apply defaults (simulating what would happen in API layer)
    const { createUserInputSchema } = await import('../schema');
    const parsedInput = createUserInputSchema.parse(inputData);

    const result = await createUser(parsedInput);

    expect(result.role).toEqual('employee');
  });

  it('should create user without password', async () => {
    const inputWithoutPassword: CreateUserInput = {
      email: 'nopass@example.com',
      phone: '555-0125',
      first_name: 'Bob',
      last_name: 'Wilson',
      role: 'admin'
    };

    const result = await createUser(inputWithoutPassword);

    expect(result.email).toEqual('nopass@example.com');
    expect(result.password_hash).toBeNull();
    expect(result.role).toEqual('admin');
    expect(result.is_active).toBe(true);
  });

  it('should reject duplicate email addresses', async () => {
    // Create first user
    await createUser(testInput);

    // Attempt to create second user with same email
    const duplicateInput: CreateUserInput = {
      email: 'test@example.com', // Same email
      phone: '555-9999',
      first_name: 'Different',
      last_name: 'Person',
      role: 'employee',
      password: 'differentPassword'
    };

    // Should throw error due to unique constraint
    await expect(createUser(duplicateInput)).rejects.toThrow(/duplicate key value violates unique constraint/i);
  });

  it('should handle all user roles correctly', async () => {
    const adminInput: CreateUserInput = {
      email: 'admin@example.com',
      phone: '555-0001',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      password: 'adminPass'
    };

    const managerInput: CreateUserInput = {
      email: 'manager@example.com',
      phone: '555-0002',
      first_name: 'Manager',
      last_name: 'User',
      role: 'manager',
      password: 'managerPass'
    };

    const employeeInput: CreateUserInput = {
      email: 'employee@example.com',
      phone: '555-0003',
      first_name: 'Employee',
      last_name: 'User',
      role: 'employee',
      password: 'employeePass'
    };

    const adminResult = await createUser(adminInput);
    const managerResult = await createUser(managerInput);
    const employeeResult = await createUser(employeeInput);

    expect(adminResult.role).toEqual('admin');
    expect(managerResult.role).toEqual('manager');
    expect(employeeResult.role).toEqual('employee');
  });

  it('should set timestamps correctly', async () => {
    const beforeCreation = new Date();
    
    const result = await createUser(testInput);
    
    const afterCreation = new Date();

    // Verify timestamps are within reasonable range
    expect(result.created_at >= beforeCreation).toBe(true);
    expect(result.created_at <= afterCreation).toBe(true);
    expect(result.updated_at >= beforeCreation).toBe(true);
    expect(result.updated_at <= afterCreation).toBe(true);
  });
});