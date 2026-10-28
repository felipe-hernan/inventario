/*
 * Arranque de la demo: eventos globales, menú del celular y atajos de teclado.
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
  // Cerrar el diálogo tocando afuera
  $('#dlg').addEventListener('click', e => { if (e.target.id === 'dlg') UI.cerrarDialogo(); });

  // ---------- Atajos de teclado (como el sistema que usa el cliente) ----------
  const ATAJOS = { F1: 'vender', F2: 'clientes', F3: 'productos', F4: 'mercaderia', F6: 'caja', F7: 'informes' };
  document.addEventListener('keydown', e => {
    if (ATAJOS[e.key]) {
      e.preventDefault();
      if ($('#dlg').open) UI.cerrarDialogo();
      UI.navegar(ATAJOS[e.key]);
    } else if (e.key === 'F8' && UI.vistaActual() === 'vender' && !$('#dlg').open) {
      e.preventDefault();
      App.acciones['venta-cobrar']();
    }
  });

  // ---------- Menú sándwich (celular) ----------
  const barra = $('.barra');
  const botonMenu = $('.boton-menu');
  function menuAbierto(abrir) {
    if (!botonMenu) return;
    barra.classList.toggle('abierta', abrir);
    botonMenu.setAttribute('aria-expanded', String(abrir));
    botonMenu.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
  }
  if (botonMenu) botonMenu.addEventListener('click', () => menuAbierto(!barra.classList.contains('abierta')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && barra.classList.contains('abierta')) { menuAbierto(false); botonMenu.focus(); }
  });
  document.addEventListener('click', e => {
    if (barra.classList.contains('abierta') && !barra.contains(e.target)) menuAbierto(false);
  });
  barra.addEventListener('click', e => {
    if (e.target.closest('.menu a, .estado-caja, [data-accion=datos-abrir]')) menuAbierto(false);
  });

  window.addEventListener('hashchange', () => {
    menuAbierto(false);
    UI.cerrarDialogo();
    UI.render();
    window.scrollTo(0, 0);
    UI.vista().focus({ preventScroll: true });
  });

  // ---------- Datos de la demo ----------
  App.acciones['datos-abrir'] = () => UI.abrirDialogo(`
    <div class="dlg-cuerpo">
      ${UI.cabecera('Datos de la demo')}
      <p>Todo lo que cargues queda guardado en este navegador, en esta computadora o celular. Otra persona que abra la demo ve sus propios datos.</p>
      <div class="pila">
        <button type="button" class="boton boton-sec" data-accion="datos-ejemplo">Volver a los datos de ejemplo</button>
        <button type="button" class="boton boton-sec" data-accion="datos-vacio">Empezar sin datos</button>
      </div>
    </div>`, { ancho: 'chico' });
  App.acciones['datos-ejemplo'] = () => {
    if (!confirm('Se borra todo lo que cargaste y vuelven los datos de ejemplo. ¿Seguir?')) return;
    DB.reiniciar(true);
    location.reload();
  };
  App.acciones['datos-vacio'] = () => {
    if (!confirm('Se borra todo y el sistema queda sin productos, clientes ni ventas. ¿Seguir?')) return;
    DB.reiniciar(false);
    location.hash = 'inicio';
    location.reload();
  };

  // Mostrar los atajos solo en pantallas con teclado
  if (UI.esTactil) document.documentElement.classList.add('tactil');

  DB.cargar();
  UI.render();
})();
