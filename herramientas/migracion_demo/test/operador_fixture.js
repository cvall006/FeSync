// Proceso hijo SOLO para pruebas de caída/reserva. Sin datos personales por stdout.
const { abrir } = require('../herramienta');
const modo = process.argv[2];
if (!['caida', 'reserva'].includes(modo)) process.exit(20);
const esperar = () => new Promise(() => { setInterval(() => {}, 1000); });
const t = abrir({ reservaMs: modo === 'reserva' ? 60000 : 1000, lote: 20, ganchos: {
  async antesDeMotor() {
    if (modo === 'reserva') { console.log('RESERVA_DEMO_ADQUIRIDA'); await esperar(); }
  },
  async despuesDeMotor() {
    if (modo === 'caida') { console.log('COMMIT_DEMO_CONFIRMADO'); await esperar(); }
  },
} });
t.ejecutar('aplicar', modo).then(async () => { await t.cerrar(); process.exit(91); },
  async () => { await t.cerrar(); process.exit(92); });
