import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Health Claims API',
      version: '1.0.0',
      description: 'API for the Health Claims management portal',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: 'Total number of records' },
            page: { type: 'integer', description: 'Current page number' },
            limit: { type: 'integer', description: 'Records per page' },
            totalPages: { type: 'integer', description: 'Total number of pages' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            pagination: { $ref: '#/components/schemas/Pagination' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: 'Error message' },
            code: { type: 'string', description: 'Error code (optional)' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'User ID (CUID)' },
            email: { type: 'string', format: 'email', description: 'User email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['PATIENT', 'ADJUSTER', 'FINANCE_OFFICER', 'ADMIN'] },
            isActive: { type: 'boolean' },
            specialty: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Policy: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            type: { type: 'string', enum: ['BASIC', 'STANDARD', 'PREMIUM'] },
            description: { type: 'string', nullable: true },
            coverageAmount: { type: 'number' },
            deductible: { type: 'number' },
            copayPercentage: { type: 'number' },
            oopMax: { type: 'number' },
            effectiveDate: { type: 'string', format: 'date-time' },
            expiryDate: { type: 'string', format: 'date-time' },
            isActive: { type: 'boolean' },
          },
        },
        ClaimLine: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            claimId: { type: 'string' },
            lineNumber: { type: 'integer' },
            cptCode: { type: 'string' },
            modifier: { type: 'string', nullable: true },
            diagnosisPointers: { type: 'array', items: { type: 'integer' } },
            units: { type: 'integer' },
            billedAmount: { type: 'number' },
            allowedAmount: { type: 'number', nullable: true },
            adjudicationStatus: { type: 'string', enum: ['PENDING', 'APPROVED', 'REDUCED', 'DENIED'] },
            denialReason: { type: 'string', nullable: true },
          },
        },
        ClaimEvent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            claimId: { type: 'string' },
            userId: { type: 'string' },
            action: { type: 'string', description: 'Action type (SUBMIT, APPROVE, REJECT, etc.)' },
            fromStatus: { type: 'string', nullable: true },
            toStatus: { type: 'string', nullable: true },
            note: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            claimId: { type: 'string' },
            filename: { type: 'string' },
            originalName: { type: 'string' },
            mimeType: { type: 'string' },
            size: { type: 'integer' },
            type: { type: 'string', enum: ['DOCUMENT', 'EOB', 'RECEIPT'] },
            isSystemGenerated: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Claim: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            claimNumber: { type: 'string' },
            patientId: { type: 'string' },
            policyId: { type: 'string' },
            type: { type: 'string', enum: ['HOSPITALIZATION', 'OUTPATIENT', 'DENTAL', 'VISION', 'PHARMACY'] },
            status: { type: 'string', enum: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED', 'INFO_RESPONDED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'WITHDRAWN', 'APPEAL_PENDING', 'APPEAL_DENIED'] },
            description: { type: 'string' },
            incidentDate: { type: 'string', format: 'date-time' },
            totalAmount: { type: 'number' },
            totalBilled: { type: 'number', nullable: true },
            totalAllowed: { type: 'number', nullable: true },
            eligibleAmount: { type: 'number', nullable: true },
            reimbursable: { type: 'number', nullable: true },
            networkStatus: { type: 'string', enum: ['IN', 'OUT'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            deletedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Payout: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            claimId: { type: 'string' },
            amount: { type: 'number' },
            paymentRef: { type: 'string' },
            batchRef: { type: 'string', nullable: true },
            notes: { type: 'string', nullable: true },
            paidAt: { type: 'string', format: 'date-time' },
          },
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            title: { type: 'string' },
            message: { type: 'string' },
            type: { type: 'string', enum: ['info', 'success', 'warning', 'error'] },
            isRead: { type: 'boolean' },
            link: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string', nullable: true },
            action: { type: 'string' },
            resource: { type: 'string' },
            resourceId: { type: 'string', nullable: true },
            details: { type: 'string', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
