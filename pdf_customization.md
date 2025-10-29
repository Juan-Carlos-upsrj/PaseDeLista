# 📄 Guía de Personalización de PDFs - Asistencia IAEV

## Tipos de PDF Generados

La aplicación genera dos tipos de PDFs:

### 1. Reporte Resumen (Vista Reportes)
- **Contenido:** Tabla resumen con estadísticas por alumno
- **Incluye:** Logo, nombre del grupo, periodo, gráfico
- **Orientación:** Horizontal (Landscape)

### 2. Tabla Completa de Asistencia (Vista Asistencia)
- **Contenido:** Tabla detallada día por día
- **Incluye:** Logo, encabezados de mes/parcial, todos los días de clase
- **Orientación:** Horizontal (Landscape)

---

## 🎨 Personalizar el Diseño del PDF

### Ubicación del código
**Archivo:** `renderer.js`

### Para el Reporte Resumen

Buscar la sección `exportPdfBtn.addEventListener('click', async () => {`

**Estructura HTML del PDF:**

```html
<div class="header">
    <!-- Logo y título de la institución -->
</div>
<div class="report-info">
    <!-- Información del grupo y periodo -->
</div>
<table class="report-table">
    <!-- Tabla de datos -->
</table>
<div class="chart-container">
    <!-- Gráfico estadístico -->
</div>
```

### Modificaciones Comunes

#### 1. Cambiar el tamaño del logo
```css
.header img { max-height: 70px; }  /* Modificar este valor */
```

#### 2. Agregar información del docente
En la sección `.report-info`, agregar:

```html
<p><strong>Docente:</strong> ${nombreDocente}</p>
```

#### 3. Agregar información de días de clase
```javascript
const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const diasClase = group.class_days.split(',').map(d => diasSemana[d]).join(', ');
```

Luego en el HTML:
```html
<p><strong>Días de clase:</strong> ${diasClase}</p>
```

#### 4. Cambiar colores del tema
```css
.report-table th { 
    background-color: #4a90e2;  /* Color de encabezados */
    color: white;
}
.low-attendance { 
    background-color: #ffebee;  /* Fondo para baja asistencia */
    color: #D32F2F; 
}
```

#### 5. Agregar pie de página
Antes del cierre de `</body>`:
```html
<div class="footer">
    <p>Generado el: ${new Date().toLocaleDateString('es-MX', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    })}</p>
</div>
```

Con CSS:
```css
.footer { 
    margin-top: 30px; 
    text-align: center; 
    font-size: 8px; 
    color: #666; 
    border-top: 1px solid #ccc; 
    padding-top: 10px; 
}
```

---

## 📊 Para la Tabla Completa de Asistencia

### Ubicación
Buscar: `document.getElementById('export-full-attendance-pdf-btn').addEventListener('click'`

### Personalizar encabezados de mes

Actualmente los meses tienen colores alternos. Para cambiarlos:

```javascript
// En la función generateAttendanceGridHTML, buscar:
const monthColspans = {};
```

**Cambiar esquema de colores:**

En `styles.css`:
```css
.month-bg-1 { 
    background-color: #e0e7ff !important;  /* Morado claro */
    color: #3730a3; 
}
.month-bg-2 { 
    background-color: #dcfce7 !important;  /* Verde claro */
    color: #166534; 
}
```

### Agregar leyenda de estados

Antes de la tabla, agregar:

```html
<div class="legend">
    <h4>Leyenda:</h4>
    <span class="legend-item"><strong>P:</strong> Presente</span>
    <span class="legend-item"><strong>A:</strong> Ausente</span>
    <span class="legend-item"><strong>R:</strong> Retardo</span>
    <span class="legend-item"><strong>I:</strong> Intercambio</span>
</div>
```

Con CSS:
```css
.legend { 
    margin-bottom: 15px; 
    padding: 10px; 
    background-color: #f5f5f5; 
    border-radius: 4px; 
}
.legend-item { 
    margin-right: 20px; 
    font-size: 9px; 
}
```

---

## 🔧 Configuración Avanzada

### Cambiar orientación del PDF

En `main.js`, función `export-formatted-pdf`:

```javascript
const pdfData = await pdfWindow.webContents.printToPDF({
    printBackground: true,
    pageSize: 'Letter',
    landscape: true,  // false para vertical, true para horizontal
    margins: { top: 15, bottom: 15, left: 15, right: 15 }
});
```

### Cambiar tamaño de página

Opciones disponibles:
- `'Letter'` - 8.5" x 11" (estándar en México/USA)
- `'Legal'` - 8.5" x 14"
- `'Tabloid'` - 11" x 17"
- `'A3'` - 297mm x 420mm
- `'A4'` - 210mm x 297mm

```javascript
pageSize: 'A4',  // Cambiar aquí
```

### Ajustar márgenes

```javascript
margins: { 
    top: 20,     // Margen superior
    bottom: 20,  // Margen inferior
    left: 20,    // Margen izquierdo
    right: 20    // Margen derecho
}
```

---

## 💡 Tips de Diseño

### 1. Fuentes
- Usar tamaños entre 8-12px para contenido
- Usar 14-18px para títulos
- Evitar fuentes muy decorativas

### 2. Colores
- Usar alto contraste para impresión
- Evitar colores muy claros en fondos blancos
- Considerar impresión en blanco y negro

### 3. Tablas
- Mantener celdas de tamaño uniforme
- Usar bordes claros y consistentes
- Alternar colores de fila para mejor legibilidad

### 4. Imágenes
- Logos: PNG con fondo transparente
- Tamaño óptimo: no más de 200px de ancho
- Resolución: mínimo 72 DPI

---

## 🎯 Plantilla Completa Personalizada

### Ejemplo: PDF con encabezado institucional completo

```javascript
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Reporte de Asistencia</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            font-size: 10px; 
        }
        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            border-bottom: 3px solid #003366; 
            padding-bottom: 15px; 
            margin-bottom: 20px; 
        }
        .header img { max-height: 80px; }
        .header-text { text-align: right; }
        .header-text h1 { 
            margin: 0; 
            font-size: 20px; 
            color: #003366; 
        }
        .header-text p { 
            margin: 5px 0 0 0; 
            font-size: 12px; 
            color: #666; 
        }
        .info-box {
            background-color: #f0f4f8;
            padding: 15px;
            border-left: 4px solid #003366;
            margin-bottom: 20px;
        }
        .info-box h2 {
            margin: 0 0 10px 0;
            font-size: 16px;
            color: #003366;
        }
        .info-row {
            display: flex;
            margin-bottom: 5px;
        }
        .info-label {
            font-weight: bold;
            width: 150px;
        }
        .data-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 30px; 
        }
        .data-table th, .data-table td { 
            border: 1px solid #ddd; 
            padding: 8px; 
            text-align: left; 
        }
        .data-table th { 
            background-color: #003366; 
            color: white;
            font-weight: bold;
        }
        .data-table tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        .low-attendance { 
            background-color: #ffebee !important; 
            color: #c62828;
            font-weight: bold;
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 8px;
            color: #999;
            border-top: 1px solid #ddd;
            padding-top: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="file://${logoPath}" alt="Logo">
        <div class="header-text">
            <h1>Instituto de Altos Estudios Universitarios</h1>
            <p>Dirección Académica - Control Escolar</p>
        </div>
    </div>
    
    <div class="info-box">
        <h2>Información del Grupo</h2>
        <div class="info-row">
            <span class="info-label">Grupo:</span>
            <span>${group.group_name}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Materia:</span>
            <span>${group.subject_name}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Periodo:</span>
            <span>${periodName}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Días de clase:</span>
            <span>${diasClase}</span>
        </div>
        <div class="info-row">
            <span class="info-label">Docente:</span>
            <span>[Nombre del docente]</span>
        </div>
    </div>
    
    ${tableHTML}
    ${chartHtml}
    
    <div class="footer">
        <p>Documento generado el ${new Date().toLocaleDateString('es-MX', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        })} a las ${new Date().toLocaleTimeString('es-MX')}</p>
        <p>Sistema de Gestión de Asistencias IAEV v2.0</p>
    </div>
</body>
</html>
`;
```

---

## ⚙️ Variables Disponibles

Al personalizar los PDFs, tienes acceso a estas variables:

### Del grupo:
- `group.group_name` - Nombre del grupo
- `group.subject_name` - Nombre de la materia
- `group.class_days` - Días de clase (ej: "1,3,5")
- `group.start_date` - Fecha de inicio
- `group.end_date` - Fecha de fin
- `group.partial1_end_date` - Fin del primer parcial

### De configuración:
- `state.settings.globalStartDate`
- `state.settings.globalPartial1EndDate`
- `state.settings.globalEndDate`

### Del reporte:
- `state.reportData` - Array con datos de cada alumno
- `periodName` - Nombre del periodo seleccionado

---

## 🐛 Solución de Problemas

### El PDF no muestra el logo
**Verificar:**
1. Archivo existe en `assets/iaev-logo.png`
2. Tiene permisos de lectura
3. La función `getAssetPath` retorna la ruta correcta

### El diseño se ve diferente al esperado
**Causa:** CSS no compatible con printToPDF
**Solución:** Usar CSS básico, evitar flexbox complejo

### El gráfico no aparece en el PDF
**Verificar:**
1. Chart.js está cargado
2. El gráfico se genera antes de exportar
3. La función `toBase64Image()` no arroja error

---

## 📚 Recursos Adicionales

- [Electron printToPDF Docs](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions)
- [Chart.js Docs](https://www.chartjs.org/docs/latest/)
- [CSS para impresión](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/print)
