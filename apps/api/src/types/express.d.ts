import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      currentUser?: Pick<User, 'id' | 'email' | 'username'>;
    }
  }
}

export {};
