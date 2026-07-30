import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AuthenticationError, AuthorizationError } from '@/lib/auth';

export class ConflictError extends Error {
    status = 409;
}

export class NotFoundError extends Error {
    status = 404;
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
    return NextResponse.json({ data }, init);
}

export function jsonCreated<T>(data: T) {
    return jsonOk(data, { status: 201 });
}

export async function apiHandler(handler: () => Promise<Response>): Promise<Response> {
    try {
        return await handler();
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json(
                {
                    error: {
                        code: 'validation_error',
                        message: 'The request is invalid.',
                        details: error.flatten(),
                    },
                },
                { status: 400 },
            );
        }
        if (
            error instanceof AuthenticationError ||
            error instanceof AuthorizationError ||
            error instanceof ConflictError ||
            error instanceof NotFoundError
        ) {
            return NextResponse.json(
                {
                    error: {
                        code: error.constructor.name,
                        message: error.message,
                    },
                },
                { status: error.status },
            );
        }
        console.error(error);
        return NextResponse.json(
            {
                error: {
                    code: 'internal_error',
                    message: 'The operation could not be completed.',
                },
            },
            { status: 500 },
        );
    }
}

export async function parseJson<T>(request: Request, schema: { parse: (input: unknown) => T }) {
    return schema.parse(await request.json());
}
