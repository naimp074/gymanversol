# Operación y recuperación

## Puesta en marcha

La PC principal ejecuta `server.mjs`. Las demás pantallas abren el navegador y se conectan a ella. Solo debe existir un proceso servidor usando una misma carpeta de datos. No colocar la base activa en una carpeta de red o en una carpeta sincronizada mientras el servidor está abierto: guardar allí copias descargadas del sistema.

En la primera instalación se crea el dueño. Usar una cuenta distinta para cada empleado permite atribuir operaciones en la auditoría. El sistema conserva los movimientos financieros; una venta anulada genera una compensación en lugar de borrar el movimiento original.

## Caja

La caja abierta es compartida entre los usuarios. El sistema requiere apertura para registrar cuotas, movimientos o ventas. El saldo esperado al cierre suma apertura, ingresos en efectivo y resta gastos/retiros en efectivo. Transferencias, Mercado Pago y tarjetas permanecen en el historial y los reportes, pero no se suman a los billetes esperados en el cajón.

Registrar un método de pago no comprueba el pago en un servicio externo. El personal debe confirmar el cobro antes de registrarlo.

## Copias

Generar una copia manual desde Configuración antes de una actualización importante. Descargar el archivo SQLite que devuelve el sistema y copiarlo a otro dispositivo. Las copias incluyen socios, pagos, fotos y otros archivos almacenados en la base.

La política automática crea una copia diaria cuando el servidor está funcionando. No copia datos a un disco externo ni a la nube por sí sola. La rotación conserva hasta 14 copias locales; mantener aparte los archivos que deban conservarse más tiempo.

## Restaurar una copia

1. Detener el servidor con `Ctrl+C` y comprobar que las otras pantallas ya no pueden operar.
2. Localizar la carpeta usada por el servidor: `data/` por defecto, o el valor de `GYM_DATA_DIR`.
3. Guardar una copia completa de esa carpeta en otra ubicación antes de reemplazar archivos.
4. Mover `gym.sqlite` y sus posibles archivos auxiliares `gym.sqlite-wal` y `gym.sqlite-shm` a una carpeta de resguardo. Conservar los originales para poder revertir.
5. Copiar el backup descargado a la carpeta de datos y renombrar esa copia como **`gym.sqlite`**. No restaurar solo el archivo principal dejando auxiliares antiguos junto a él.
6. Iniciar el servidor con la misma configuración de `GYM_DATA_DIR`.
7. Iniciar sesión con una cuenta existente en la fecha del backup y comprobar socios, último pago, caja y ventas. Los cambios posteriores a la fecha de la copia no estarán presentes.

No reemplazar la base con el servidor abierto. La restauración se realiza manualmente: no hay una acción de restauración dentro de la aplicación.

## Estado del alcance solicitado

| Área | Entrega local | Trabajo posterior |
| --- | --- | --- |
| Administración | Socios, usuarios, planes, cuotas, caja, gastos y auditoría | Facturación fiscal e integraciones contables |
| Accesos | Identificación manual, identificador QR, validaciones y asistencia | Lector de huellas, enrolamiento y SDK del equipo elegido |
| Entrenamiento | Profesores, clases, reservas por el personal, rutinas y progreso | Portal del socio y reservas autónomas |
| Comercio | Productos, stock, ventas y anulaciones | Integración bancaria o de terminal de cobro |
| Comunicación | Mensajes de WhatsApp preparados para enviar | Envíos automáticos y proveedor autorizado |
| Reportes | Vistas del sistema, CSV para Excel e impresión a PDF | Libro Excel nativo y reportes a medida adicionales |
| Operación | Base local, trabajo sin Internet y acceso por LAN | Alojamiento remoto, HTTPS e instalación como servicio |
| Copias | Backups SQLite automáticos y manuales | Copia externa automática, sincronización en nube y restauración desde UI |

La configuración del servidor, el código y la carpeta de datos son elementos diferentes. Los backups de la aplicación contienen la base de datos; conservar también una copia del proyecto para recuperar el sistema completo en otra PC.
