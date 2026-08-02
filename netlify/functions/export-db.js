const { getDb } = require('../../src/lib/mongodb');
const { checkPermission } = require('../../src/lib/auth');
const { withAuth } = require('../../src/lib/helpers');
const XLSX = require('xlsx');

exports.handler = withAuth(async (event, context, user) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  }

  

  if (!checkPermission(user, ['Admin'])) {
    return { statusCode: 403, body: JSON.stringify({ message: 'Apenas administradores podem exportar dados' }) };
  }

  const format = event.queryStringParameters?.format || 'json';

  try {
    const db = await getDb();

    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    const exportData = {};

    for (const name of collectionNames) {
      if (name.startsWith('system.')) continue;
      const docs = await db.collection(name).find({}).toArray();
      exportData[name] = docs;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();

      for (const [name, docs] of Object.entries(exportData)) {
        const flatDocs = docs.map(doc => {
          const flat = {};
          for (const [key, val] of Object.entries(doc)) {
            if (val && typeof val === 'object' && val._bsontype === 'ObjectId') {
              flat[key] = val.toString();
            } else if (val instanceof Date) {
              flat[key] = val.toISOString();
            } else if (val && typeof val === 'object' && !Array.isArray(val)) {
              flat[key] = JSON.stringify(val);
            } else if (Array.isArray(val)) {
              flat[key] = JSON.stringify(val);
            } else {
              flat[key] = val;
            }
          }
          return flat;
        });

        const ws = XLSX.utils.json_to_sheet(flatDocs);

        const colWidths = Object.keys(flatDocs[0] || {}).map(k => ({
          wch: Math.min(Math.max(String(k).length + 2, 20), 60)
        }));
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
      }

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="buildflow-backup-${timestamp}.xlsx"`
        },
        body: buf.toString('base64'),
        isBase64Encoded: true
      };
    }

    const jsonString = JSON.stringify(exportData, null, 2);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="buildflow-backup-${timestamp}.json"`
      },
      body: jsonString
    };
  } catch (error) {
    console.error('Erro ao exportar dados:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro ao exportar dados' })
    };
  }
});
