import swaggerJSDoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Cloud File Manager REST API',
    version: '1.0.0',
    description: 'Personal Cloud File Management system documentation with Express, MySQL, and AWS S3',
    contact: {
      name: 'Nguyen Van Manh',
      email: 'manh@gmail.com'
    }
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local Development Server'
    }
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'session',
        description: 'HttpOnly server-side session cookie issued by login'
      }
    }
  },
  security: [
    {
      sessionCookie: []
    }
  ]
};

const options = {
  swaggerDefinition,
  apis: ['./src/routes/*.js', './src/config/swagger-docs.js']
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
