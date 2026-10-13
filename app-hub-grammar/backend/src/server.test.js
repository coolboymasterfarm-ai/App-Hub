const request = require('supertest');
const app = require('./server');

describe('Grammar Check API', () => {
  it('should return error for missing text', async () => {
    const response = await request(app)
      .post('/api/check')
      .send({});
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Text is required and must be a string');
  });

  it('should check grammar for valid text', async () => {
    // This test will fail without LanguageTool running, which is expected
    const response = await request(app)
      .post('/api/check')
      .send({ text: 'This is a test.' });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('matches');
  });

  it('should return error for invalid text type', async () => {
    const response = await request(app)
      .post('/api/check')
      .send({ text: 123 });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Text is required and must be a string');
  });

  it('should return error for empty text', async () => {
    const response = await request(app)
      .post('/api/check')
      .send({ text: '' });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Text is required and must be a string');
  });
});