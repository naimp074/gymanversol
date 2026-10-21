# Anversol Gym

Sistema web para administrar el gimnasio desde una PC principal. La base SQLite, las fotos, los certificados y los archivos de la aplicación se guardan localmente. El funcionamiento cotidiano no requiere Internet.

## Iniciar

Se necesita **Node.js 22.18 o superior**. No hay paquetes externos para instalar.

En Windows, abrir `iniciar-gym.cmd`, o ejecutar desde esta carpeta:

```powershell
npm start
```

El sistema tiene tres partes:

- **http://localhost:3000** · sitio web público del gimnasio: planes, próximas clases, equipo, horarios y contacto. Los textos (frase principal, quiénes somos, horarios, WhatsApp, Instagram, email) se editan en Administración → Configuración → Datos del gimnasio.
- **http://localhost:3000/admin** · administración, con los mismos usuarios y permisos de siempre.
- **http://localhost:3000/socios** · portal de socios. El socio entra con su DNI y ve su cuota, cuántos días por semana entrena (gráfico de las últimas 12 semanas con meta semanal), racha, días favoritos, calendario de asistencia, rutina, medidas y clases reservadas. No ve datos de otros socios ni información médica, de contacto de emergencia o de pagos.

`iniciar-gym.cmd` abre directamente la administración. En el primer inicio se crea el usuario dueño y su contraseña. Los datos de demostración son opcionales; dejá esa opción desactivada para comenzar a cargar socios reales. Las contraseñas deben tener al menos ocho caracteres.

Mantener el proceso abierto mientras se usa el sistema. Para detenerlo, presionar `Ctrl+C` en la ventana del servidor. Un aviso de Node sobre SQLite experimental no impide el funcionamiento.

## Usar en el gimnasio

1. Crear los planes y configurar los datos del gimnasio.
2. Crear usuarios individuales con los permisos que correspondan.
3. Registrar los socios. Elegir un plan no equivale a cobrar una cuota.
4. Abrir la caja e indicar el efectivo inicial.
5. Registrar los pagos para activar o renovar las membresías.
6. Registrar entradas y salidas desde el control de accesos.
7. Cerrar la caja con el efectivo contado al finalizar el turno.

El sistema calcula precios y vencimientos en el servidor. Las renovaciones anticipadas conservan los días ya pagados. Los ingresos rechazados quedan registrados, pero no se cuentan como personas admitidas. Una entrada abierta evita registrar al mismo socio dos veces dentro del gimnasio.

## Funciones incluidas

- Inicio de sesión y roles de dueño, administrador, recepcionista, profesor y contador, con permisos controlados por el servidor.
- Fichas de socios, fotos, contactos de emergencia, certificados, estados y búsqueda.
- Planes, cuotas, vencimientos, alertas, registro de pagos e historial de cada socio.
- Control de acceso manual y mediante identificador QR, entrada/salida, control de cuota, horario y apto físico configurable.
- Apertura y cierre de caja, ingresos, gastos, retiros y diferencias de efectivo.
- Productos, stock, ventas y anulación de ventas con devolución de stock y movimiento compensatorio.
- Profesores, clases con cupo, reservas gestionadas por el personal, rutinas y registros de progreso.
- Panel de gestión, asistencia, cumpleaños, reportes y auditoría de modificaciones.
- Exportación CSV compatible con Excel; reportes imprimibles mediante el navegador, que permite guardar como PDF.
- Copias de seguridad SQLite locales, automáticas y manuales, descargables por un administrador.
- Botones de WhatsApp que preparan un mensaje para revisar y enviar desde WhatsApp.

Los importes se expresan en pesos argentinos enteros. Los períodos de los planes se expresan en días; un plan de 30 días no equivale necesariamente a un mes calendario. El servidor usa la fecha de Argentina.

## Otras computadoras de la red local

Por defecto solo se permite conectar desde la PC principal. Para habilitar explícitamente la red local, detener el proceso y ejecutar:

```powershell
$env:HOST = '0.0.0.0'
npm start
```

Desde otra PC, celular o tablet de la misma red, abrir `http://IP-DE-LA-PC:3000`; por ejemplo, `http://192.168.1.20:3000`. La IP se puede consultar con `ipconfig` en la PC principal. Windows puede solicitar permitir Node en el firewall: elegir la red privada del gimnasio. El router y la PC principal deben seguir encendidos aunque se corte Internet.

No publicar el puerto del servidor en Internet. Este inicio local utiliza HTTP; el acceso remoto fuera del gimnasio requiere una configuración adicional de conexión segura. Para cambiar el puerto, definir `$env:PORT = '3001'` antes de iniciar. Para volver al acceso solo local, usar `$env:HOST = '127.0.0.1'`.

## Datos y copias de seguridad

La base predeterminada es `data/gym.sqlite` y las copias se guardan en `data/backups/`. Para elegir otra carpeta antes de iniciar:

```powershell
$env:GYM_DATA_DIR = 'D:\AnversolDatos'
npm start
```

Se generan copias locales diarias mientras el servidor está funcionando, con retención limitada a las últimas 14 copias. Desde Configuración también se puede crear y descargar una copia manual. **Una copia en el mismo disco no protege frente a una avería de ese disco**: descargar periódicamente una copia y guardarla en un disco externo. Los backups incluyen los datos personales almacenados en el sistema; conservarlos en una ubicación privada.

La restauración se realiza con el proceso detenido. El procedimiento y las comprobaciones se describen en [docs/operacion.md](docs/operacion.md).

## Integraciones pendientes

**Huella digital:** todavía no hay lector. La conexión y el enrolamiento biométrico se implementarán cuando se elija el modelo y su SDK; esta versión no captura ni simula huellas. Mientras tanto se puede identificar al socio manualmente. El identificador QR no reemplaza la futura integración biométrica.

**WhatsApp:** abre borradores; no envía mensajes automáticamente. Requiere Internet y una cuenta de WhatsApp para el envío.

**Medios de pago:** registrar “Mercado Pago”, “Transferencia”, “Débito” o “Crédito” documenta el cobro informado por el personal. No conecta con bancos, terminales ni pasarelas, ni confirma el ingreso real del dinero. No emite comprobantes fiscales.

**Nube y acceso de socios:** no incluye sincronización de backups a la nube, app con cuentas de socios, reserva autónoma desde el celular, pagos online ni automatizaciones externas. El personal puede acceder desde un navegador en la red local.

## Verificar

```powershell
npm test
```

Las pruebas usan una base temporal independiente: verifican autenticación, permisos, pagos, renovaciones, accesos, cupos, stock, caja, exportaciones, backups y persistencia después de reiniciar. No modifican la base usada por el gimnasio.
