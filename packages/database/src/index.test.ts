import { describe, expect, it } from 'vitest';
import {
  DATABASE_PACKAGE_NAME,
  DatabaseError,
  DatabaseErrorCode,
  isForeignKeyConstraintError,
  isUniqueConstraintError,
} from './index.js';

describe('@nanking-atlas/database', () => {
  it('exposes DATABASE_PACKAGE_NAME as a stable literal', () => {
    expect(DATABASE_PACKAGE_NAME).toBe('@nanking-atlas/database');
  });

  it('DatabaseError carries DatabaseErrorCode', () => {
    const err = new DatabaseError(DatabaseErrorCode.NOT_FOUND, 'not found');
    expect(err.name).toBe('DatabaseError');
    expect(err.code).toBe(DatabaseErrorCode.NOT_FOUND);
    expect(err.message).toBe('not found');
  });

  describe('Prisma error helpers', () => {
    it('detects P2002 unique constraint violations', () => {
      expect(
        isUniqueConstraintError({
          name: 'PrismaClientKnownRequestError',
          code: 'P2002',
          meta: { target: ['slug'] },
        }),
      ).toBe(true);
      expect(isUniqueConstraintError({ name: 'OtherError', code: 'P2002' })).toBe(false);
      expect(isUniqueConstraintError(new Error('plain'))).toBe(false);
    });

    it('detects P2003 foreign key violations', () => {
      expect(
        isForeignKeyConstraintError({
          name: 'PrismaClientKnownRequestError',
          code: 'P2003',
          meta: { field_name: 'user_id' },
        }),
      ).toBe(true);
      expect(isForeignKeyConstraintError({ name: 'OtherError', code: 'P2003' })).toBe(false);
      expect(isForeignKeyConstraintError(null)).toBe(false);
    });
  });
});