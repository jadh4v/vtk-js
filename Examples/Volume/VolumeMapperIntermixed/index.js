import 'vtk.js/Sources/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import 'vtk.js/Sources/Rendering/Profiles/Volume';

// Force DataAccessHelper to have access to various data source
import 'vtk.js/Sources/IO/Core/DataAccessHelper/HtmlDataAccessHelper';
import 'vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import 'vtk.js/Sources/IO/Core/DataAccessHelper/JSZipDataAccessHelper';

import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
import vtkHttpDataSetReader from 'vtk.js/Sources/IO/Core/HttpDataSetReader';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
import controlPanel from './controller.html';

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
  background: [0.4, 0.4, 0.4],
});
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

fullScreenRenderer.addController(controlPanel);

// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------
// Server is not sending the .gz and with the compress header
// Need to fetch the true file name and uncompress it locally
// ----------------------------------------------------------------------------

const reader = vtkHttpDataSetReader.newInstance({ fetchGzip: true });

const sampleDistance = 0.7;

const actor = vtkVolume.newInstance();
const mapper = vtkVolumeMapper.newInstance();
mapper.setSampleDistance(sampleDistance);
actor.setMapper(mapper);

// create color and opacity transfer functions
const ofun = vtkPiecewiseFunction.newInstance();
ofun.addPoint(0, 0.0);
ofun.addPoint(900, 0.2);
ofun.addPoint(3000, 0.5);

const ctfun = vtkColorTransferFunction.newInstance();
ctfun.addRGBPoint(0, 1.0, 0.2, 0.2);
ctfun.addRGBPoint(900, 0.7, 0.7, 0.2);
ctfun.addRGBPoint(1200, 0.2, 1.0, 0.2);
ctfun.addRGBPoint(2000, 0.2, 0.7, 0.7);
ctfun.addRGBPoint(3000, 0.2, 0.2, 1.0);

actor.getProperty().setRGBTransferFunction(0, ctfun);
actor.getProperty().setScalarOpacity(0, ofun);
actor.getProperty().setScalarOpacityUnitDistance(0, 3.0);
actor.getProperty().setInterpolationTypeToLinear();

mapper.setInputConnection(reader.getOutputPort());
mapper.setBlendModeToComposite();

const actor2 = vtkVolume.newInstance();
const mapper2 = vtkVolumeMapper.newInstance();
mapper2.setSampleDistance(sampleDistance);
actor2.setMapper(mapper2);
// changing visibility crashes
// actor2.setVisibility(false);

// create color and opacity transfer functions
const ofun2 = vtkPiecewiseFunction.newInstance();
ofun2.addPoint(0, 0.0);
ofun2.addPoint(900, 0.0);
ofun2.addPoint(3000, 0.0);

const ctfun2 = vtkColorTransferFunction.newInstance();
ctfun2.addRGBPoint(0, 0, 0, 0);
ctfun2.addRGBPoint(900, 0.5, 0.5, 0.5);
ctfun2.addRGBPoint(3000, 1.0, 1.0, 1.0);

actor2.getProperty().setRGBTransferFunction(0, ctfun2);
actor2.getProperty().setScalarOpacity(0, ofun2);
actor2.getProperty().setScalarOpacityUnitDistance(0, 3.0);
actor2.getProperty().setInterpolationTypeToLinear();

mapper2.setInputConnection(reader.getOutputPort());
mapper2.setBlendModeToMaximumIntensity();

function updateMaxMix(event) {
  ofun2.addPoint(900, 0.7 * event.target.value);
  ofun2.addPoint(3000, event.target.value);
  // changing visibility crashes
  // actor2.setVisibility(event.target.value > 0);
  renderWindow.render();
}

function updateCompositeMix(event) {
  ofun.addPoint(900, 0.2 * event.target.value);
  ofun.addPoint(3000, 0.5 * event.target.value);
  // changing visibility crashes
  // actor.setVisibility(event.target.value > 0);
  renderWindow.render();
}

const maxMixEl = document.querySelector('.maxMix');
maxMixEl.addEventListener('input', updateMaxMix);
const compositeMixEl = document.querySelector('.compositeMix');
compositeMixEl.addEventListener('input', updateCompositeMix);

reader.setUrl(`${__BASE_PATH__}/data/volume/headsq.vti`).then(() => {
  reader.loadData().then(() => {
    // renderer.addVolume(actor);
    renderer.addVolume(actor2);
    const interactor = renderWindow.getInteractor();
    interactor.setDesiredUpdateRate(15.0);
    renderer.resetCamera();
    renderer.getActiveCamera().elevation(-70);
    renderer.getActiveCamera().zoom(2.2);
    renderWindow.render();
  });
});

// -----------------------------------------------------------
// Make some variables global so that you can inspect and
// modify objects in your browser's developer console:
// -----------------------------------------------------------

global.mapper = mapper;
global.actor = actor;
global.renderer = renderer;
global.renderWindow = renderWindow;
