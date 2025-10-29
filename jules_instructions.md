# 🔧 Instrucciones de Corrección - Aplicación de Asistencia IAEV

## Paso 1: Agregar Chart.js al HTML

**Archivo:** `index.html`

**Acción:** Antes de la línea `<script src="./renderer.js"></script>`, agregar:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

**Ubicación exacta:** Justo antes del cierre de la etiqueta `</body>`

---

## Paso 2: Corregir función de exportación PDF

**Archivo:** `main.js`

**Acción:** Reemplazar COMPLETAMENTE la función `ipcMain.handle('export-formatted-pdf')` 

**Buscar esta línea:**
```javascript
ipcMain.handle('export-formatted-pdf', async (event, { htmlContent, defaultFilename }) => {
```

**Reemplazar toda la función (hasta el `});` correspondiente) con:**

```javascript
ipcMain.handle('export-formatted-pdf', async (event, { htmlContent, defaultFilename }) => {
    const { filePath } = await dialog.showSaveDialog({
        title: 'Guardar PDF',
        defaultPath: defaultFilename || 'reporte.pdf',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!filePath) {
        return { success: false, cancelled: true };
    }

    const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        }
    });

    try {
        let processedHtml = htmlContent;
        const fileRegex = /file:\/\/([^"']+)/g;
        const matches = [...htmlContent.matchAll(fileRegex)];
        
        for (const match of matches) {
            const filePath = match[1];
            try {
                if (fs.existsSync(filePath)) {
                    const imageBuffer = fs.readFileSync(filePath);
                    const base64Image = imageBuffer.toString('base64');
                    const ext = path.extname(filePath).toLowerCase().substring(1);
                    const mimeType = ext === 'png' ? 'image/png' : 
                                   ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                                   'image/png';
                    const dataUrl = `data:${mimeType};base64,${base64Image}`;
                    processedHtml = processedHtml.replace(match[0], dataUrl);
                }
            } catch (err) {
                console.error('Error procesando imagen:', err);
            }
        }

        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(processedHtml)}`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const pdfData = await pdfWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: 'Letter',
            landscape: true,
            margins: { top: 15, bottom: 15, left: 15, right: 15 }
        });

        fs.writeFileSync(filePath, pdfData);
        return { success: true, path: filePath };

    } catch (err) {
        console.error("Error generando PDF formateado:", err);
        return { success: false, error: err.message };
    } finally {
        if (pdfWindow && !pdfWindow.isDestroyed()) {
            pdfWindow.close();
        }
    }
});
```

---

## Paso 3: Agregar validación de Chart.js en renderer.js

**Archivo:** `renderer.js`

**Acción 1:** Al inicio del evento DOMContentLoaded (después de `document.addEventListener('DOMContentLoaded', () => {`), agregar:

```javascript
// Verificar que Chart.js esté disponible
if (typeof Chart === 'undefined') {
    console.error('Chart.js no está cargado. Los gráficos no funcionarán.');
}
```

**Acción 2:** Buscar la función `async function generateReport()` y en la sección donde se crea el gráfico (cerca del final), REEMPLAZAR:

```javascript
// --- Render Chart ---
if (reportChart) {
    reportChart.destroy();
}

const ctx = document.getElementById('report-chart').getContext('2d');
```

**CON:**

```javascript
// --- Render Chart con validación ---
if (typeof Chart !== 'undefined') {
    if (reportChart) {
        reportChart.destroy();
    }

    const ctx = document.getElementById('report-chart').getContext('2d');
```

**Y al final del bloque de Chart, cerrar con:**

```javascript
        });
    } else {
        console.warn('Chart.js no disponible, el gráfico no se mostrará');
    }
}
```

**Acción 3:** En el `exportPdfBtn.addEventListener`, buscar esta línea:

```javascript
const chartImage = reportChart ? reportChart.toBase64Image() : '';
```

**Y REEMPLAZAR todo el bloque de obtención de imagen del gráfico con:**

```javascript
let chartHtml = '';
if (reportChart && typeof reportChart.toBase64Image === 'function') {
    try {
        const chartImage = reportChart.toBase64Image();
        chartHtml = `
            <div class="chart-container">
                <h3>Resumen Gráfico</h3>
                <img src="${chartImage}" alt="Gráfico de Asistencia" style="max-width: 100%; height: auto;">
            </div>`;
    } catch (err) {
        console.error('Error al convertir gráfico a imagen:', err);
    }
}
```

---

## Paso 4: Crear carpeta de Assets

**Acción:** Crear la carpeta `assets/` en la raíz del proyecto (al mismo nivel que `main.js`).

**Contenido requerido:**

1. **iaev-logo.png** 
   - Imagen del logo de la institución
   - Tamaño recomendado: 200x70 píxeles (ancho x alto)
   - Formato: PNG con fondo transparente

2. **icon.png**
   - Icono de la aplicación
   - Tamaño: 256x256 píxeles
   - Formato: PNG

**Nota:** Si no tienes estas imágenes, crea placeholders temporales de esos tamaños con el color de la institución.

---

## Paso 5: Verificar estructura final del proyecto

```
proyecto/
├── assets/
│   ├── iaev-logo.png
│   └── icon.png
├── index.html
├── main.js
├── preload.js
├── renderer.js
├── styles.css
├── quotes.default.json
├── package.json
└── forge.config.js
```

---

## Paso 6: Pruebas

Después de aplicar todas las correcciones:

1. **Reiniciar la aplicación:**
   ```bash
   npm start
   ```

2. **Probar:**
   - Crear un grupo con alumnos
   - Registrar asistencia
   - Generar un reporte
   - Verificar que el gráfico se muestre
   - Exportar el reporte a PDF
   - Verificar que el PDF incluya el logo y el gráfico

3. **Si hay errores:**
   - Abrir DevTools (F12 o Ctrl+Shift+I)
   - Revisar la consola para mensajes de error
   - Verificar que los archivos de assets existan

---

## ⚠️ Errores Comunes y Soluciones

### Error: "Chart is not defined"
**Solución:** Verificar que Chart.js esté cargado en index.html ANTES de renderer.js

### Error: "Cannot read properties of null (reading 'toBase64Image')"
**Solución:** Ya corregido con las validaciones agregadas en Paso 3

### Error: "Failed to load resource: file://"
**Solución:** Ya corregido con la conversión a base64 en main.js (Paso 2)

### PDF sin logo
**Solución:** Verificar que el archivo assets/iaev-logo.png existe y tiene permisos de lectura

---

## 🎯 Checklist Final

- [ ] Chart.js agregado a index.html
- [ ] Función export-formatted-pdf actualizada en main.js
- [ ] Validaciones de Chart agregadas en renderer.js
- [ ] Carpeta assets/ creada con logo e icono
- [ ] Aplicación reiniciada y probada
- [ ] Exportación de PDF funciona correctamente
- [ ] Logo se muestra en el PDF
- [ ] Gráfico se incluye en el PDF

---

## 📞 Soporte Adicional

Si después de seguir estos pasos persisten problemas:
1. Capturar mensajes de error de la consola
2. Verificar versión de Electron: `npm list electron`
3. Verificar versiones de dependencias en package.json
