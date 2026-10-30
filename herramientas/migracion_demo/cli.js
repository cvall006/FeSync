const { ErrorDemo, validarEntorno } = require('./entorno');
const { parsear } = require('./argumentos');
async function main() {
  let herramienta;
  try {
    const { modo, checkpoint, opciones } = parsear(process.argv.slice(2));
    validarEntorno();
    herramienta = require('./herramienta').abrir(opciones);
    const resultado = ['aplicar', 'reanudar'].includes(modo)
      ? await herramienta.ejecutar(modo, checkpoint)
      : await herramienta[modo](...(modo === 'verificar' ? [checkpoint] : []));
    // Las APIs públicas solo devuelven métricas, estados y constantes de configuración.
    console.log(JSON.stringify({ modo, resultado }));
    process.exitCode = resultado.detenida ? 3 : resultado.completa === false ? 2 : 0;
  } catch (error) {
    console.error(JSON.stringify({ error: error instanceof ErrorDemo ? error.codigo : 'ERROR_LOCAL' }));
    process.exitCode = 20;
  } finally {
    if (herramienta) {
      try { await herramienta.cerrar(); }
      catch { console.error(JSON.stringify({ error: 'CIERRE_LOCAL_FALLIDO' })); process.exitCode = 20; }
    }
  }
}
main();
