# Tareas Pendientes (TODO)

## Sincronización y Compartición
- [ ] **Sincronización Selectiva de Agenda (Diary):** Actualmente la función `mergeData` ignora por completo la tabla `diary` al importar/fusionar un backup para proteger la privacidad de los eventos y métricas personales de cada usuario de la familia. En el futuro, se debe implementar una interfaz que pregunte qué registros del diario se quieren sincronizar, o utilizar un sistema de "Propietarios" para que cada usuario pueda compartir y fusionar sus propios registros en una base de datos común sin pisar los demás.
