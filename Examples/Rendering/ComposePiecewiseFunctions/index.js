import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Volume';

import Constants from '@kitware/vtk.js/Rendering/Core/ImageMapper/Constants';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkInteractorStyleImage from '@kitware/vtk.js/Interaction/Style/InteractorStyleImage';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkITKHelper from '@kitware/vtk.js/Common/DataModel/ITKHelper';
import vtkResourceLoader from '@kitware/vtk.js/IO/Core/ResourceLoader';

const { SlicingMode } = Constants;

// ----------------------------------------------------------------------------
// Rendering setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0.1, 0.1, 0.1],
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

const mapper = vtkImageMapper.newInstance();
mapper.setSlicingMode(SlicingMode.K);
mapper.setSliceAtFocalPoint(true);

const actor = vtkImageSlice.newInstance();
actor.setMapper(mapper);

const iStyle = vtkInteractorStyleImage.newInstance();
iStyle.setInteractionMode('IMAGE_SLICING');
renderWindow.getInteractor().setInteractorStyle(iStyle);

// ----------------------------------------------------------------------------
// Piecewise function composition
//
// We maintain two component functions:
//   opacityFn   — window/level ramp (controls visible intensity range)
//   composeFn   — threshold fade  (suppresses values above a threshold)
//
// Their pointwise product is stored in resultFn and applied to the actor,
// which is the "composed" piecewise function rendered by ImageMapper.
// ----------------------------------------------------------------------------

const opacityFn = vtkPiecewiseFunction.newInstance();
const composeFn = vtkPiecewiseFunction.newInstance();
const resultFn = vtkPiecewiseFunction.newInstance();
const colorFn = vtkColorTransferFunction.newInstance();

// Collect all x-positions from both functions and evaluate the product.
// getDataPointer() returns a flat [x0,y0,x1,y1,...] array.
function recompose(dataRange) {
  const xSet = new Set();
  const addXsFromFn = (fn) => {
    const data = fn.getDataPointer();
    if (data) {
      for (let i = 0; i < data.length; i += 2) {
        xSet.add(data[i]);
      }
    }
  };
  addXsFromFn(opacityFn);
  addXsFromFn(composeFn);
  // Also add range endpoints so the composed function spans the full range
  xSet.add(dataRange[0]);
  xSet.add(dataRange[1]);

  const xs = Array.from(xSet).sort((a, b) => a - b);
  resultFn.removeAllPoints();
  xs.forEach((x) => {
    const a = opacityFn.getValue(x);
    const b = composeFn.getValue(x);
    resultFn.addPoint(x, a * b);
  });

  actor.getProperty().setPiecewiseFunction(0, resultFn);
}

function buildOpacityFunction(dataRange, colorWindow, colorLevel) {
  const [min, max] = dataRange;
  const lo = Math.max(min, colorLevel - colorWindow * 0.5);
  const hi = Math.min(max, colorLevel + colorWindow * 0.5);

  opacityFn.removeAllPoints();
  opacityFn.addPoint(min, 0);
  opacityFn.addPoint(lo, 0);
  opacityFn.addPoint(hi, 1);
  opacityFn.addPoint(max, 1);
}

function buildComposeFn(dataRange, threshold, softness) {
  const [min, max] = dataRange;
  const span = (max - min) * softness;
  const lo = Math.max(min, threshold - span);
  const hi = Math.min(max, threshold + span);

  composeFn.removeAllPoints();
  composeFn.addPoint(min, 1);
  composeFn.addPoint(lo, 1);
  composeFn.addPoint(hi, 0);
  composeFn.addPoint(max, 0);
}

function buildColorFunction(dataRange) {
  const [min, max] = dataRange;
  colorFn.removeAllPoints();
  colorFn.addRGBPoint(min, 0, 0, 0);
  colorFn.addRGBPoint(max, 1, 1, 1);
  actor.getProperty().setRGBTransferFunction(0, colorFn);
}

// ----------------------------------------------------------------------------
// Camera helpers
// ----------------------------------------------------------------------------

function resetCamera() {
  const bounds = mapper.getInputData().getBounds();
  const camera = renderer.getActiveCamera();
  camera.setParallelProjection(true);
  const cx = (bounds[0] + bounds[1]) / 2;
  const cy = (bounds[2] + bounds[3]) / 2;
  const cz = (bounds[4] + bounds[5]) / 2;
  camera.setFocalPoint(cx, cy, cz);
  const normal = mapper.getSlicingModeNormal();
  camera.setPosition(cx + normal[0], cy + normal[1], cz + normal[2]);
  camera.setViewUp(0, 1, 0);
  renderer.resetCamera();
}

// ----------------------------------------------------------------------------
// UI helpers
// ----------------------------------------------------------------------------

const body = document.querySelector('body');

function makeSlider(label, min, max, value, step, onChange) {
  const wrap = document.createElement('div');
  wrap.style.marginBottom = '10px';

  const lbl = document.createElement('label');
  lbl.style.display = 'block';
  lbl.style.marginBottom = '2px';

  const valueSpan = document.createElement('span');
  valueSpan.innerText = ` ${Math.round(value)}`;

  lbl.appendChild(document.createTextNode(label));
  lbl.appendChild(valueSpan);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.value = value;
  input.step = step;
  input.style.width = '100%';

  input.addEventListener('input', () => {
    valueSpan.innerText = ` ${Math.round(Number(input.value))}`;
    onChange(Number(input.value));
  });

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  return { wrap, input };
}

// ----------------------------------------------------------------------------
// Load overlay (visible before any file is loaded)
// ----------------------------------------------------------------------------

const loadOverlay = document.createElement('div');
Object.assign(loadOverlay.style, {
  position: 'absolute',
  top: '0',
  left: '0',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0,0,0,0.75)',
  zIndex: '10',
  color: '#fff',
  fontFamily: 'sans-serif',
});

const loadTitle = document.createElement('p');
loadTitle.innerText = 'Compose Piecewise Functions — DICOM Viewer';
Object.assign(loadTitle.style, { fontSize: '18px', marginBottom: '16px' });

const loadButton = document.createElement('button');
loadButton.innerText = 'Load DICOM File';
Object.assign(loadButton.style, {
  padding: '10px 24px',
  fontSize: '15px',
  cursor: 'pointer',
  borderRadius: '4px',
  border: 'none',
  background: '#4a90e2',
  color: '#fff',
});

const statusText = document.createElement('p');
statusText.style.marginTop = '12px';
statusText.style.fontSize = '13px';
statusText.innerText = '';

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = '.dcm,application/dicom';
fileInput.style.display = 'none';

loadButton.addEventListener('click', () => fileInput.click());

loadOverlay.appendChild(loadTitle);
loadOverlay.appendChild(loadButton);
loadOverlay.appendChild(statusText);
loadOverlay.appendChild(fileInput);
body.appendChild(loadOverlay);

// ----------------------------------------------------------------------------
// Controls panel (visible after a file is loaded)
// ----------------------------------------------------------------------------

const controlPanel = document.createElement('div');
Object.assign(controlPanel.style, {
  position: 'absolute',
  top: '10px',
  right: '10px',
  background: 'rgba(0,0,0,0.7)',
  color: '#fff',
  fontFamily: 'sans-serif',
  fontSize: '13px',
  padding: '12px',
  borderRadius: '6px',
  display: 'none',
  minWidth: '230px',
  zIndex: '5',
});
body.appendChild(controlPanel);

// ----------------------------------------------------------------------------
// DICOM load + render
// ----------------------------------------------------------------------------

function renderDicom(file) {
  statusText.innerText = 'Reading file…';
  const reader = new FileReader();
  reader.onload = async (e) => {
    statusText.innerText = 'Decoding DICOM…';
    const { image: itkImage, webWorker } =
      await window.itk.readImageArrayBuffer(null, e.target.result, file.name);
    webWorker.terminate();

    const imageData = vtkITKHelper.convertItkToVtkImage(itkImage);
    mapper.setInputData(imageData);

    const scalars = imageData.getPointData().getScalars();
    const dataRange = scalars.getRange();

    const colorWindow = dataRange[1] - dataRange[0];
    const colorLevel = Math.round((dataRange[0] + dataRange[1]) / 2);
    const threshold = Math.round(colorLevel + colorWindow * 0.3);

    buildColorFunction(dataRange);
    buildOpacityFunction(dataRange, colorWindow, colorLevel);
    buildComposeFn(dataRange, threshold, 0.1);
    recompose(dataRange);

    if (!renderer.getActors().length) {
      renderer.addActor(actor);
    }
    resetCamera();
    renderWindow.render();

    // Hide overlay, populate and show controls
    loadOverlay.style.display = 'none';
    controlPanel.innerHTML = '';

    const heading = document.createElement('div');
    heading.innerText = 'Piecewise Function Controls';
    Object.assign(heading.style, {
      fontWeight: 'bold',
      marginBottom: '10px',
      fontSize: '14px',
    });
    controlPanel.appendChild(heading);

    // ---- Window/level ----
    const wlHeading = document.createElement('div');
    wlHeading.innerText = 'Opacity ramp (window / level)';
    Object.assign(wlHeading.style, {
      fontSize: '11px',
      color: '#aaa',
      marginBottom: '4px',
    });
    controlPanel.appendChild(wlHeading);

    let levelInput;
    const { input: windowInput } = makeSlider(
      'Window:',
      1,
      colorWindow * 2,
      colorWindow,
      1,
      (val) => {
        buildOpacityFunction(dataRange, val, Number(levelInput.value));
        recompose(dataRange);
        renderWindow.render();
      }
    );
    controlPanel.appendChild(windowInput.parentElement);

    ({ input: levelInput } = makeSlider(
      'Level:',
      dataRange[0],
      dataRange[1],
      colorLevel,
      1,
      (val) => {
        buildOpacityFunction(dataRange, Number(windowInput.value), val);
        recompose(dataRange);
        renderWindow.render();
      }
    ));
    controlPanel.appendChild(levelInput.parentElement);

    // ---- Compose function ----
    const composeHeading = document.createElement('div');
    composeHeading.innerText = 'Compose function (threshold fade)';
    Object.assign(composeHeading.style, {
      fontSize: '11px',
      color: '#aaa',
      margin: '8px 0 4px',
    });
    controlPanel.appendChild(composeHeading);

    let softnessInput;
    const { input: threshInput } = makeSlider(
      'Threshold:',
      dataRange[0],
      dataRange[1],
      threshold,
      1,
      (val) => {
        buildComposeFn(dataRange, val, Number(softnessInput.value) / 100);
        recompose(dataRange);
        renderWindow.render();
      }
    );
    controlPanel.appendChild(threshInput.parentElement);

    ({ input: softnessInput } = makeSlider(
      'Softness (%):',
      0,
      50,
      10,
      1,
      (val) => {
        buildComposeFn(dataRange, Number(threshInput.value), val / 100);
        recompose(dataRange);
        renderWindow.render();
      }
    ));
    controlPanel.appendChild(softnessInput.parentElement);

    // ---- Reload button ----
    const reloadBtn = document.createElement('button');
    reloadBtn.innerText = 'Load New File';
    Object.assign(reloadBtn.style, {
      marginTop: '10px',
      padding: '6px 12px',
      cursor: 'pointer',
      background: '#4a90e2',
      color: '#fff',
      border: 'none',
      borderRadius: '4px',
      width: '100%',
    });
    reloadBtn.addEventListener('click', () => {
      loadOverlay.style.display = 'flex';
      statusText.innerText = '';
      loadButton.innerText = 'Load DICOM File';
      loadButton.disabled = false;
      controlPanel.style.display = 'none';
      fileInput.value = '';
    });
    controlPanel.appendChild(reloadBtn);

    controlPanel.style.display = 'block';
  };
  reader.readAsArrayBuffer(file);
}

// ----------------------------------------------------------------------------
// itk-wasm bootstrap
// ----------------------------------------------------------------------------

let itkReady = false;

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (itkReady) {
    renderDicom(file);
  } else {
    loadButton.innerText = 'Loading itk-wasm…';
    loadButton.disabled = true;
    statusText.innerText = 'Downloading DICOM decoder…';
    vtkResourceLoader
      .loadScript('https://cdn.jsdelivr.net/npm/itk-wasm@1.0.0-b.8/dist/umd/itk-wasm.js')
      .then(() => {
        itkReady = true;
        renderDicom(file);
      });
  }
});

// Pre-fetch itk-wasm in the background so first load is faster
vtkResourceLoader
  .loadScript(
    'https://cdn.jsdelivr.net/npm/itk-wasm@1.0.0-b.8/dist/umd/itk-wasm.js'
  )
  .then(() => {
    itkReady = true;
  });

// -----------------------------------------------------------
// Global references for browser console inspection
// -----------------------------------------------------------

global.mapper = mapper;
global.actor = actor;
global.renderer = renderer;
global.renderWindow = renderWindow;
global.opacityFn = opacityFn;
global.composeFn = composeFn;
global.resultFn = resultFn;
global.colorFn = colorFn;
