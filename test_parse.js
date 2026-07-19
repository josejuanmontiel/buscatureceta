import fs from 'fs';

async function testStream() {
    const fileStream = fs.createReadStream('src/public/spain_products.tsv.zz');
    const originalReader = ReadableStream.from(fileStream).getReader();

    const { value: firstChunk, done: firstDone } = await originalReader.read();

    if (firstDone) throw new Error("El archivo está vacío");

    const isGzip = firstChunk[0] === 0x1f && firstChunk[1] === 0x8b;
    const isDeflate = firstChunk[0] === 0x78 && (firstChunk[1] === 0x9c || firstChunk[1] === 0xda || firstChunk[1] === 0x01);

    console.log("isGzip:", isGzip, "isDeflate:", isDeflate);

    let stream = new ReadableStream({
        start(controller) {
            controller.enqueue(firstChunk);
        },
        async pull(controller) {
            const { value, done } = await originalReader.read();
            if (done) {
                controller.close();
            } else {
                controller.enqueue(value);
            }
        },
        cancel() {
            originalReader.cancel();
        }
    });

    if (isGzip) {
        stream = stream.pipeThrough(new DecompressionStream('gzip'));
    } else if (isDeflate) {
        stream = stream.pipeThrough(new DecompressionStream('deflate'));
    }

    stream = stream.pipeThrough(new TextDecoderStream());
    const reader = stream.getReader();

    let buffer = '';
    let headers = null;
    let chunk = [];
    const CHUNK_SIZE = 5000;
    let totalSaved = 0;

    while (true) {
        const { value, done } = await reader.read();
        if (value) {
            buffer += value;
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const cols = line.split('\t');

                if (!headers) {
                    headers = cols.map(h => h.trim());
                    console.log("Headers found:", headers.length);
                    continue;
                }

                const obj = {};
                for (let j = 0; j < headers.length; j++) {
                    if (cols[j]) {
                        obj[headers[j]] = cols[j].replace(/^"|"$/g, '');
                    }
                }
                
                obj.code = obj.code || obj.id;
                if (obj.code) {
                    chunk.push(obj);
                }

                if (chunk.length >= CHUNK_SIZE) {
                    totalSaved += chunk.length;
                    chunk = [];
                    console.log(`Procesando... (${totalSaved} guardados)`);
                }
            }
        }

        if (done) break;
    }

    if (buffer.trim()) {
        const cols = buffer.trim().split('\t');
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            if (cols[j]) obj[headers[j]] = cols[j].replace(/^"|"$/g, '');
        }
        obj.code = obj.code || obj.id;
        if (obj.code) chunk.push(obj);
    }

    if (chunk.length > 0) {
        totalSaved += chunk.length;
    }

    console.log(`Guardados ${totalSaved} productos exitosamente.`);
}

testStream().catch(console.error);
