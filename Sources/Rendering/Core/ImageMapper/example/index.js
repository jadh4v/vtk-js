import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Volume';

import Constants from '@kitware/vtk.js/Rendering/Core/ImageMapper/Constants';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkRTAnalyticSource from '@kitware/vtk.js/Filters/Sources/RTAnalyticSource';
import vtkImageMapper from '@kitware/vtk.js/Rendering/Core/ImageMapper';
import vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import vtkInteractorStyleImage from '@kitware/vtk.js/Interaction/Style/InteractorStyleImage';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';

const { SlicingMode } = Constants;

// ----------------------------------------------------------------------------
// Standard rendering code setup
// ----------------------------------------------------------------------------

const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance();
const renderer = fullScreenRenderer.getRenderer();
const renderWindow = fullScreenRenderer.getRenderWindow();

// ----------------------------------------------------------------------------
// Example code
// ----------------------------------------------------------------------------

const rtSource = vtkRTAnalyticSource.newInstance();
rtSource.setWholeExtent(0, 200, 0, 200, 0, 200);
rtSource.setCenter(0, 0, 0);
rtSource.setStandardDeviation(0.3);

const mapper = vtkImageMapper.newInstance();
mapper.setInputConnection(rtSource.getOutputPort());
mapper.setSliceAtFocalPoint(true);
mapper.setSlicingMode(SlicingMode.K);
// mapper.setZSlice(5);

const rgb = vtkColorTransferFunction.newInstance();
global.rgb = rgb;
rgb.addRGBPoint(0, 0, 0, 0);
rgb.addRGBPoint(255, 1, 1, 1);

const ofun = vtkPiecewiseFunction.newInstance();
global.ofun = ofun;
ofun.addPoint(0, 1);
ofun.addPoint(150, 1);
ofun.addPoint(180, 0);
ofun.addPoint(255, 0);

const actor = vtkImageSlice.newInstance();
actor.getProperty().setColorWindow(255);
actor.getProperty().setColorLevel(127);
// Uncomment this if you want to use a fixed colorwindow/level
// actor.getProperty().setRGBTransferFunction(rgb);
actor.getProperty().setPiecewiseFunction(ofun);
actor.setMapper(mapper);
renderer.addActor(actor);

const iStyle = vtkInteractorStyleImage.newInstance();
iStyle.setInteractionMode('IMAGE_SLICING');
renderWindow.getInteractor().setInteractorStyle(iStyle);

const camera = renderer.getActiveCamera();
const position = camera.getFocalPoint();
// offset along the slicing axis
const normal = mapper.getSlicingModeNormal();
position[0] += normal[0];
position[1] += normal[1];
position[2] += normal[2];
camera.setPosition(...position);
switch (mapper.getSlicingMode()) {
  case SlicingMode.X:
    camera.setViewUp([0, 1, 0]);
    break;
  case SlicingMode.Y:
    camera.setViewUp([1, 0, 0]);
    break;
  case SlicingMode.Z:
    camera.setViewUp([0, 1, 0]);
    break;
  default:
}
camera.setParallelProjection(true);
renderer.resetCamera();
renderWindow.render();

/*
const superHandleMouseMove = iStyle.handleMouseMove;
iStyle.handleMouseMove = (callData) => {
  superHandleMouseMove(callData);
  console.log('I was called');
};
*/
iStyle.onEndInteractionEvent(() => {
  console.log('Compute visible image index bounds: ');
  // This step assumes that we only have a single view in our window.
  // If you have multiple viewports, you will need to find out which
  // view you want to work on.
  const view = renderWindow.getViews()[0];
  const viewSize = view.getSize();

  const image = mapper.getInputData();
  const extent = image.getExtent();
  const minIJK = [extent[0], extent[2], extent[4]];
  const maxIJK = [extent[1], extent[3], extent[5]];

  const p0 = iStyle.computeDisplayToWorld(renderer, 0, 0, 0);
  let i0 = image.worldToIndex(p0);
  i0 = vtkMath.clampVector(i0, minIJK, maxIJK);

  const p1 = iStyle.computeDisplayToWorld(
    renderer,
    viewSize[0],
    viewSize[1],
    0
  );

  let i1 = image.worldToIndex(p1);
  i1 = vtkMath.clampVector(i1, minIJK, maxIJK);

  const sliceNumber = mapper.getSlice();
  console.log('sliceNumber: ', sliceNumber);
  const slicingMode = mapper.getSlicingMode();
  const sdim = slicingMode % 3;
  let v = [0, 0, 0];
  switch (slicingMode) {
    case SlicingMode.I:
    case SlicingMode.J:
    case SlicingMode.K:
      i0[sdim] = sliceNumber;
      i1[sdim] = sliceNumber;
      break;
    case SlicingMode.X:
    case SlicingMode.Y:
    case SlicingMode.Z:
      v[sdim] = sliceNumber;
      v = image.worldToIndex(v);
      i0[sdim] = vtkMath.clampVector(v, minIJK, maxIJK)[sdim];
      i1[sdim] = vtkMath.clampVector(v, minIJK, maxIJK)[sdim];
      break;
    default:
  }

  console.log('i0 = ', i0);
  console.log('i1 = ', i1);
});

// -----------------------------------------------------------
// Make some variables global so that you can inspect and
// modify objects in your browser's developer console:
// -----------------------------------------------------------

global.source = rtSource;
global.mapper = mapper;
global.actor = actor;
global.renderer = renderer;
global.renderWindow = renderWindow;
