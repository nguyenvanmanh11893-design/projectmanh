const swaggerJSDoc = require('swagger-jsdoc');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Cloud File Manager REST API',
    version: '1.0.0',
    description: 'Personal Cloud File Management system documentation with Express, MySQL, and AWS S3',
    contact: {
      name: 'Dao Van Manh',
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
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token in the format: Bearer <token>'
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ]
};

const options = {
  swaggerDefinition,
  apis: ['./src/routes/*.js', './src/config/swagger-docs.js']
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
