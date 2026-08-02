const { getDb } = require('../../src/lib/mongodb');
const { withAuth } = require('../../src/lib/helpers');

exports.handler = withAuth(async (event, context, user) => {
    

    try {
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            const { supplier, products } = body;
            
            const db = await getDb();
            
            // Save import record
            const importRecord = {
                supplier,
                products,
                userId: user.userId,
                userEmail: user.email,
                createdAt: new Date(),
                status: 'completed'
            };
            
            await db.collection('imports').insertOne(importRecord);
            
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'Importação salva com sucesso!' })
            };
        }
        
        return {
            statusCode: 405,
            body: 'Method not allowed'
        };
    } catch (error) {
        console.error('Import error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Erro interno do servidor'
            })
        };
    }
});
