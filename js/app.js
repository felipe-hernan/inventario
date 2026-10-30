/*
 * Arranque: eventos globales, menú lateral (offcanvas de Bootstrap) y notificaciones (dropdown).
 */
(function () {
  // ---------- Eventos delegados ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-accion]');
    if (!el || el.disabled) return;
    const fn = App.acciones[el.dataset.accion];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-input]');
    if (el && App.entradas[el.dataset.input]) App.entradas[el.dataset.input](el, e);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-cambio]');
    if (el && App.cambios[el.dataset.cambio]) App.cambios[el.dataset.cambio](el, e);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const el = e.target.closest('[data-enter]');
    if (el && App.acciones[el.dataset.enter]) { e.preventDefault(); App.acciones[el.dataset.enter](el, e); }
  });
  document.addEventListener('submit', e => {
    const form = e.target;
    if (form.dataset.enviar && App.envios[form.dataset.enviar]) {
      e.preventDefault();
      App.envios[form.dataset.enviar](form, e);
    }
  });

  // El modal enfoca su primer campo al terminar de abrirse
  $('#dlg').addEventListener('shown.bs.modal', () => UI._enfocarModal());

  // Al abrir la campana se arma la lista y se marcan como vistas
  document.addEventListener('show.bs.dropdown', e => {
    if (e.target.classList.contains('boton-notif')) UI.renderNotificaciones(e.target.nextElementSibling);
  });

  // Al navegar: cerrar el menú del celular, el modal y las notificaciones
  window.addEventListener('hashchange', () => {
    const barra = bootstrap.Offcanvas.getInstance($('#barra'));
    if (barra) barra.hide();
    UI.cerrarNotificaciones();
    UI.cerrarDialogo();
    UI.render();
    window.scrollTo(0, 0);
    UI.vista().focus({ preventScroll: true });
  });
  // Tocar un link del menú en el celular también lo cierra (aunque sea la misma pantalla)
  $$('.menu .nav-link, #estado-caja').forEach(a => a.addEventListener('click', () => {
    const barra = bootstrap.Offcanvas.getInstance($('#barra'));
    if (barra) barra.hide();
  }));

  // ---------- Datos de la demo ----------
  App.acciones['datos-abrir'] = () => {
    const barra = bootstrap.Offcanvas.getInstance($('#barra'));
    if (barra) barra.hide();
    UI.abrirDialogo({
      titulo: 'Datos de la demo',
      cuerpo: `<p>Todo lo que cargues queda guardado en este navegador, en esta computadora o celular. Otra persona que abra la demo ve sus propios datos.</p>
        <div class="d-grid gap-2">
          <button type="button" class="btn btn-outline-secondary" data-accion="datos-ejemplo"><i class="bi bi-arrow-counterclockwise"></i> Volver a los datos de ejemplo</button>
          <button type="button" class="btn btn-outline-danger" data-accion="datos-vacio"><i class="bi bi-trash"></i> Empezar sin datos</button>
        </div>`
    }, { ancho: 'chico' });
  };
  App.acciones['datos-ejemplo'] = () => {
    if (!confirm('Se borra todo lo que cargaste y vuelven los datos de ejemplo. ¿Seguir?')) return;
    DB.reiniciar(true);
    location.reload();
  };
  App.acciones['datos-vacio'] = () => {
    if (!confirm('Se borra todo y el sistema queda sin productos, clientes ni ventas. Los usuarios se conservan. ¿Seguir?')) return;
    DB.reiniciar(false, true);
    location.hash = 'inicio';
    location.reload();
  };

  DB.cargar();
  UI.render();
})();
