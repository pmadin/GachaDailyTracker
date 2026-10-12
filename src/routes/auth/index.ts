import express, { Router } from 'express';

// Import in HTTP method order for better Swagger organization
// POST routes (Registration & Login)
import { registerRouter } from './register';
import { loginRouter } from './login';
import { verifyEmailRouter } from './verifyEmail';

// GET routes - none in auth (moved to separate utilities)

// PUT routes (Profile updates)
import { profileRoutes } from './profile';

// PATCH routes (Sensitive updates requiring password)
import { passwordRouter } from './passwordUpdate';
import { emailRouter } from './emailUpdate';

// DELETE routes
import { deleteRouter } from './delete';

const authRoutes: Router = express.Router();

// Mount routes in logical order (matches HTTP method grouping)
// POST - Account creation and authentication
authRoutes.use(registerRouter);
authRoutes.use(loginRouter);
authRoutes.use(verifyEmailRouter);

// PUT - Profile management (non-sensitive)
authRoutes.use(profileRoutes);

// PATCH - Sensitive account changes (require password verification)
authRoutes.use(passwordRouter);
authRoutes.use(emailRouter);

// DELETE - Account deletion
authRoutes.use(deleteRouter);

export { authRoutes };