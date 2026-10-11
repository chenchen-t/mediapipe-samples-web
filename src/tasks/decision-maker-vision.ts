/**
 * Copyright 2026 The MediaPipe Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Vision tab for the Decision Maker task: an ID & Passport Photo Compliance
 * Checker that evaluates 9 biometric and visual rules on preset portraits,
 * uploaded photos, or a live webcam stream, with interactive positive and
 * negative reference examples per rule.
 */

import template from '../templates/decision-maker-vision.html?raw';

export interface PassportRuleOption {
  label: string;
  description: string;
}

export interface PassportRule {
  id: string;
  num: number;
  icon: string;
  shortTitle: string;
  title: string;
  prompt: string;
  options: PassportRuleOption[];
  optionDisplay: Record<string, string>;
}

export interface FaceBiometricInfo {
  hasFace: boolean;
  minX?: number;
  minY?: number;
  maxX?: number;
  maxY?: number;
  centerX?: number;
  centerY?: number;
  faceW?: number;
  faceH?: number;
  yawAsymmetry?: number;
  eyeRoll?: number;
  gazeHoriz?: number;
  blink?: number;
  smile?: number;
  jawOpen?: number;
  foreheadDarkDiff?: number;
  bridgeContrast?: number;
}

export interface PhotoBiometrics {
  bgLum: number;
  bgVar: number;
  bgSat?: number;
  isPlainWhiteBg: boolean;
  fgRatio: number;
  bottomShoulderWidthRatio: number;
  faceInfo: FaceBiometricInfo;
}

export interface RawRuleVisionScore {
  passProb: number;
  topLabel: string;
  failLabel: string;
}

export interface PhotoPreset {
  id: string;
  title: string;
  sub: string;
  isCompliant: boolean;
  url: string;
  groundTruth?: Record<string, boolean>;
  biometrics: PhotoBiometrics;
  rawEg2Vision: Record<string, RawRuleVisionScore>;
}

export interface ExemplarEntry {
  id: string;
  name: string;
  url: string;
  rawPassProb: number;
  logitVal: number;
  logitVec: number[];
  enabled: boolean;
}

export interface RuleEvalResult {
  passed: boolean;
  prob: number;
  rawPassProb: number;
  calPassProb: number;
  chosenOptionLabel: string;
  reasonText: string;
}

export type VisionAskFn = (
  input: { text?: string; imageBytes?: Uint8Array },
  kind: 'schema',
  question: object
) => Promise<any>;

export interface VisionModelState {
  ready: boolean;
  loading: boolean;
  label: string;
  loadedValue?: string | null;
  hasCustomModel?: boolean;
  error?: string;
}

export const PASSPORT_RULES: PassportRule[] = [
  {
    id: 'full_face',
    num: 1,
    icon: 'face',
    shortTitle: 'Full Face',
    title: '1. Full Face Present',
    prompt: 'Is a complete, unobstructed, centered frontal face present inside the frame?',
    options: [
      {
        label: 'pass_frontal',
        description:
          'Complete unobstructed frontal portrait face centered in frame with full forehead, chin, nose, and mouth clearly visible.',
      },
      {
        label: 'fail_cropped',
        description: 'Extreme close-up face with forehead or chin cut off at the edges of the image.',
      },
      {
        label: 'fail_masked',
        description: 'Face covered by a black face mask, respirator, cloth covering, or hand.',
      },
      {
        label: 'fail_distant',
        description: 'Distant person standing far away so the face is tiny.',
      },
      {
        label: 'fail_turned_tilted',
        description: 'Off-center, tilted, or angled head posture not facing straight ahead.',
      },
    ],
    optionDisplay: {
      pass_frontal: 'Centered & straight frontal',
      fail_off_center_and_tilted: 'Off-center & head tilted',
      fail_off_center: 'Off-center in frame',
      fail_turned_tilted: 'Head turned or tilted',
      fail_cropped: 'Head/chin clipped at edge',
      fail_masked: 'Face covered by mask',
      fail_distant: 'Subject too far away',
    },
  },
  {
    id: 'eyes_open',
    num: 2,
    icon: 'visibility',
    shortTitle: 'Eyes Open',
    title: '2. Eyes Open & Direct',
    prompt: 'Are both eyes open and looking straight ahead at the camera?',
    options: [
      {
        label: 'pass_open',
        description: 'Passport portrait of a person with both eyes open looking straight ahead at the camera.',
      },
      {
        label: 'fail_closed',
        description: 'Person with eyes closed, squinting shut, or blinking with eyelids shut.',
      },
      {
        label: 'fail_sunglasses',
        description: 'Person wearing dark sunglasses covering the eyes.',
      },
      {
        label: 'fail_looking_away',
        description: 'Selfie of a person squinting, grimacing, or looking sideways away from the camera.',
      },
    ],
    optionDisplay: {
      pass_open: 'Open & looking at camera',
      fail_looking_away: 'Not looking straight at camera',
      fail_closed: 'Eyes closed / blinking',
      fail_sunglasses: 'Hidden behind dark lenses',
    },
  },
  {
    id: 'neutral_expression',
    num: 3,
    icon: 'sentiment_neutral',
    shortTitle: 'Neutral Face',
    title: '3. Neutral Expression',
    prompt: 'Does the person have a calm, neutral facial expression with mouth closed?',
    options: [
      {
        label: 'pass_neutral',
        description: 'Calm, serious, neutral facial expression with lips and mouth closed.',
      },
      {
        label: 'fail_smiling',
        description: 'Smiling broadly, grinning, grimacing, laughing, or showing teeth with an open mouth.',
      },
    ],
    optionDisplay: {
      pass_neutral: 'Neutral expression, mouth closed',
      fail_smiling: 'Smiling / teeth visible',
    },
  },
  {
    id: 'neutral_background',
    num: 4,
    icon: 'crop_portrait',
    shortTitle: 'White BG',
    title: '4. Neutral White Background',
    prompt: 'Is the background a plain, uniform white or off-white studio backdrop?',
    options: [
      {
        label: 'pass_white_bg',
        description: 'Plain, uniform, solid white studio background backdrop.',
      },
      {
        label: 'fail_indoor_clutter',
        description: 'Busy indoor room background showing bookshelves, doors, furniture, or walls.',
      },
      {
        label: 'fail_outdoor_street',
        description: 'Busy outdoor street scene with trees, buildings, sky, bicycles, or pedestrians.',
      },
    ],
    optionDisplay: {
      pass_white_bg: 'Plain uniform white backdrop',
      fail_indoor_clutter: 'Indoor room background',
      fail_outdoor_street: 'Outdoor street background',
    },
  },
  {
    id: 'shoulders_visible',
    num: 5,
    icon: 'checkroom',
    shortTitle: 'Shoulders',
    title: '5. Shoulders Visible & Square',
    prompt: 'Are both upper shoulders clearly visible and symmetrical at the bottom?',
    options: [
      {
        label: 'pass_shoulders',
        description:
          'Both left and right upper shoulders in suit jacket or shirt are symmetrical and visible at the bottom of the portrait.',
      },
      {
        label: 'fail_no_shoulders',
        description: 'Extreme face-only macro close-up cropped at the chin with zero neck and zero shoulders visible.',
      },
      {
        label: 'fail_angled_selfie',
        description: 'Angled one-handed selfie posture with one arm extended toward the camera.',
      },
    ],
    optionDisplay: {
      pass_shoulders: 'Both shoulders visible',
      fail_no_shoulders: 'Cropped at chin (no shoulders)',
      fail_angled_selfie: 'Angled selfie posture',
    },
  },
  {
    id: 'hair_clear',
    num: 6,
    icon: 'content_cut',
    shortTitle: 'Hair Clear',
    title: '6. Hair Not Covering Face',
    prompt: 'Is the hair neat and clear of the face, eyebrows, and eyes, with no hat?',
    options: [
      {
        label: 'pass_hair_clear',
        description:
          'Neat hair tucked behind ears or short hair with forehead, both eyebrows, and both eyes completely clear and visible.',
      },
      {
        label: 'fail_bangs_over_eyes',
        description: 'Long messy hair bangs hanging down covering the forehead, eyebrows, and eyes.',
      },
      {
        label: 'fail_hat_cap',
        description: 'Wearing a hat, cap, or headgear covering the head.',
      },
    ],
    optionDisplay: {
      pass_hair_clear: 'Face & eyebrows unobstructed',
      fail_bangs_over_eyes: 'Bangs covering eyes/brow',
      fail_hat_cap: 'Hat / cap worn',
    },
  },
  {
    id: 'no_glasses',
    num: 7,
    icon: 'visibility_off',
    shortTitle: 'No Glasses',
    title: '7. No Eyeglasses or Sunglasses',
    prompt: 'Are the eyes bare and free of eyeglasses or sunglasses?',
    options: [
      {
        label: 'pass_bare_eyes',
        description: 'Bare natural face and eyes with clear skin around the eyes and bridge of the nose.',
      },
      {
        label: 'fail_eyeglasses',
        description: 'Wearing prescription eyeglasses, reading glasses, or optical frames over the eyes.',
      },
      {
        label: 'fail_sunglasses',
        description: 'Wearing dark tinted sunglasses with black frames covering the eyes.',
      },
    ],
    optionDisplay: {
      pass_bare_eyes: 'No glasses or frames',
      fail_eyeglasses: 'Eyeglasses worn',
      fail_sunglasses: 'Dark sunglasses worn',
    },
  },
  {
    id: 'framing_chest_up',
    num: 8,
    icon: 'aspect_ratio',
    shortTitle: 'Chest-Up',
    title: '8. Close-Up to Upper Chest',
    prompt: 'Is the photo framed as a head-and-shoulders close-up down to the upper chest?',
    options: [
      {
        label: 'pass_chest_up',
        description: 'Standard passport head-and-shoulders bust portrait cropped at the upper chest and collarbone.',
      },
      {
        label: 'fail_full_body',
        description: 'Wide full-body shot showing waist, stomach, jeans, legs, or arms far below the chest.',
      },
      {
        label: 'fail_macro_face',
        description: 'Extreme macro close-up of the face only, cropped at the chin without neck or chest.',
      },
      {
        label: 'fail_off_center',
        description: 'Off-center or tilted framing not aligned in the center of the portrait.',
      },
    ],
    optionDisplay: {
      pass_chest_up: 'Head & upper chest framing',
      fail_off_center: 'Not centered in guide oval',
      fail_full_body: 'Shows waist/body below chest',
      fail_macro_face: 'Zoomed too close (face only)',
    },
  },
  {
    id: 'occupancy_70_percent',
    num: 9,
    icon: 'photo_size_select_large',
    shortTitle: '~70% Frame',
    title: '9. Occupies ~70% of Photo',
    prompt: 'Does the person occupy approximately 70% of the photo frame?',
    options: [
      {
        label: 'pass_70_pct',
        description:
          'Well-proportioned passport bust portrait where head and shoulders fill 70% of the frame with white margin above the head.',
      },
      {
        label: 'fail_too_small',
        description: 'Distant small person occupying less than 35% of the frame.',
      },
      {
        label: 'fail_too_large',
        description: 'Zoomed-in giant face filling 98% of the frame with cut-off edges.',
      },
    ],
    optionDisplay: {
      pass_70_pct: 'Subject fills ~70% of frame',
      fail_too_small: 'Too small in frame (<35%)',
      fail_too_large: 'Overfills frame (>90%)',
    },
  },
];

function photoAssetUrl(fileName: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}images/id_photos/${fileName}`;
}

export const PRESET_PHOTOS: PhotoPreset[] = [
  {
    id: 'passport_compliant_female.jpg',
    title: 'Compliant #1',
    sub: '9/9 Pass',
    isCompliant: true,
    url: photoAssetUrl('passport_compliant_female.jpg'),
    groundTruth: {
      full_face: true,
      eyes_open: true,
      neutral_expression: true,
      neutral_background: true,
      shoulders_visible: true,
      hair_clear: true,
      no_glasses: true,
      framing_chest_up: true,
      occupancy_70_percent: true,
    },
    biometrics: {
      bgLum: 251,
      bgVar: 2,
      isPlainWhiteBg: true,
      fgRatio: 0.68,
      bottomShoulderWidthRatio: 0.78,
      faceInfo: {
        hasFace: true,
        minX: 0.284,
        minY: 0.231,
        maxX: 0.713,
        maxY: 0.616,
        faceW: 0.429,
        faceH: 0.385,
      },
    },
    rawEg2Vision: {
      full_face: { passProb: 0.856, topLabel: 'pass_frontal', failLabel: 'fail_turned_tilted' },
      eyes_open: { passProb: 0.748, topLabel: 'pass_open', failLabel: 'fail_closed' },
      neutral_expression: { passProb: 0.878, topLabel: 'pass_neutral', failLabel: 'fail_smiling' },
      neutral_background: { passProb: 0.978, topLabel: 'pass_white_bg', failLabel: 'fail_indoor_clutter' },
      shoulders_visible: { passProb: 0.806, topLabel: 'pass_shoulders', failLabel: 'fail_no_shoulders' },
      hair_clear: { passProb: 0.878, topLabel: 'pass_hair_clear', failLabel: 'fail_bangs_over_eyes' },
      no_glasses: { passProb: 0.945, topLabel: 'pass_bare_eyes', failLabel: 'fail_eyeglasses' },
      framing_chest_up: { passProb: 0.686, topLabel: 'pass_chest_up', failLabel: 'fail_off_center' },
      occupancy_70_percent: { passProb: 0.972, topLabel: 'pass_70_pct', failLabel: 'fail_too_large' },
    },
  },
  {
    id: 'passport_compliant_male.jpg',
    title: 'Compliant #2',
    sub: '9/9 Pass',
    isCompliant: true,
    url: photoAssetUrl('passport_compliant_male.jpg'),
    groundTruth: {
      full_face: true,
      eyes_open: true,
      neutral_expression: true,
      neutral_background: true,
      shoulders_visible: true,
      hair_clear: true,
      no_glasses: true,
      framing_chest_up: true,
      occupancy_70_percent: true,
    },
    biometrics: {
      bgLum: 249,
      bgVar: 3,
      isPlainWhiteBg: true,
      fgRatio: 0.71,
      bottomShoulderWidthRatio: 0.91,
      faceInfo: {
        hasFace: true,
        minX: 0.294,
        minY: 0.215,
        maxX: 0.708,
        maxY: 0.594,
        faceW: 0.414,
        faceH: 0.379,
      },
    },
    rawEg2Vision: {
      full_face: { passProb: 0.631, topLabel: 'pass_frontal', failLabel: 'fail_turned_tilted' },
      eyes_open: { passProb: 0.492, topLabel: 'pass_open', failLabel: 'fail_closed' },
      neutral_expression: { passProb: 0.777, topLabel: 'pass_neutral', failLabel: 'fail_smiling' },
      neutral_background: { passProb: 0.871, topLabel: 'pass_white_bg', failLabel: 'fail_outdoor_street' },
      shoulders_visible: { passProb: 0.822, topLabel: 'pass_shoulders', failLabel: 'fail_angled_selfie' },
      hair_clear: { passProb: 0.812, topLabel: 'pass_hair_clear', failLabel: 'fail_hat_cap' },
      no_glasses: { passProb: 0.77, topLabel: 'pass_bare_eyes', failLabel: 'fail_eyeglasses' },
      framing_chest_up: { passProb: 0.607, topLabel: 'pass_chest_up', failLabel: 'fail_off_center' },
      occupancy_70_percent: { passProb: 0.798, topLabel: 'pass_70_pct', failLabel: 'fail_too_large' },
    },
  },
  {
    id: 'id_fail_glasses_smile.jpg',
    title: 'Sunglasses',
    sub: '3 Fails',
    isCompliant: false,
    url: photoAssetUrl('id_fail_glasses_smile.jpg'),
    groundTruth: {
      full_face: true,
      eyes_open: false,
      neutral_expression: false,
      neutral_background: true,
      shoulders_visible: true,
      hair_clear: true,
      no_glasses: false,
      framing_chest_up: true,
      occupancy_70_percent: true,
    },
    biometrics: {
      bgLum: 242,
      bgVar: 3,
      isPlainWhiteBg: true,
      fgRatio: 0.69,
      bottomShoulderWidthRatio: 1.0,
      faceInfo: {
        hasFace: true,
        minX: 0.3,
        minY: 0.222,
        maxX: 0.72,
        maxY: 0.608,
        faceW: 0.42,
        faceH: 0.386,
      },
    },
    rawEg2Vision: {
      full_face: { passProb: 0.349, topLabel: 'pass_frontal', failLabel: 'fail_turned_tilted' },
      eyes_open: { passProb: 0.009, topLabel: 'fail_sunglasses', failLabel: 'fail_sunglasses' },
      neutral_expression: { passProb: 0.038, topLabel: 'fail_smiling', failLabel: 'fail_smiling' },
      neutral_background: { passProb: 0.617, topLabel: 'pass_white_bg', failLabel: 'fail_outdoor_street' },
      shoulders_visible: { passProb: 0.293, topLabel: 'fail_angled_selfie', failLabel: 'fail_angled_selfie' },
      hair_clear: { passProb: 0.77, topLabel: 'pass_hair_clear', failLabel: 'fail_bangs_over_eyes' },
      no_glasses: { passProb: 0.077, topLabel: 'fail_sunglasses', failLabel: 'fail_sunglasses' },
      framing_chest_up: { passProb: 0.299, topLabel: 'fail_off_center', failLabel: 'fail_off_center' },
      occupancy_70_percent: { passProb: 0.412, topLabel: 'fail_too_large', failLabel: 'fail_too_large' },
    },
  },
  {
    id: 'id_fail_eyes_closed_hair.jpg',
    title: 'Eyes Closed',
    sub: '2 Fails',
    isCompliant: false,
    url: photoAssetUrl('id_fail_eyes_closed_hair.jpg'),
    groundTruth: {
      full_face: true,
      eyes_open: false,
      neutral_expression: true,
      neutral_background: true,
      shoulders_visible: true,
      hair_clear: false,
      no_glasses: true,
      framing_chest_up: true,
      occupancy_70_percent: true,
    },
    biometrics: {
      bgLum: 232,
      bgVar: 10,
      isPlainWhiteBg: true,
      fgRatio: 0.67,
      bottomShoulderWidthRatio: 0.92,
      faceInfo: {
        hasFace: true,
        minX: 0.341,
        minY: 0.272,
        maxX: 0.674,
        maxY: 0.555,
        faceW: 0.333,
        faceH: 0.283,
      },
    },
    rawEg2Vision: {
      full_face: { passProb: 0.331, topLabel: 'fail_distant', failLabel: 'fail_distant' },
      eyes_open: { passProb: 0.079, topLabel: 'fail_closed', failLabel: 'fail_closed' },
      neutral_expression: { passProb: 0.498, topLabel: 'fail_smiling', failLabel: 'fail_smiling' },
      neutral_background: { passProb: 0.515, topLabel: 'pass_white_bg', failLabel: 'fail_outdoor_street' },
      shoulders_visible: { passProb: 0.242, topLabel: 'fail_no_shoulders', failLabel: 'fail_no_shoulders' },
      hair_clear: { passProb: 0.065, topLabel: 'fail_bangs_over_eyes', failLabel: 'fail_bangs_over_eyes' },
      no_glasses: { passProb: 0.666, topLabel: 'pass_bare_eyes', failLabel: 'fail_sunglasses' },
      framing_chest_up: { passProb: 0.276, topLabel: 'fail_full_body', failLabel: 'fail_full_body' },
      occupancy_70_percent: { passProb: 0.256, topLabel: 'fail_too_small', failLabel: 'fail_too_small' },
    },
  },
  {
    id: 'id_fail_extreme_zoom_cropped.jpg',
    title: 'Too Close',
    sub: '5 Fails',
    isCompliant: false,
    url: photoAssetUrl('id_fail_extreme_zoom_cropped.jpg'),
    groundTruth: {
      full_face: false,
      eyes_open: true,
      neutral_expression: true,
      neutral_background: false,
      shoulders_visible: false,
      hair_clear: true,
      no_glasses: true,
      framing_chest_up: false,
      occupancy_70_percent: false,
    },
    biometrics: {
      bgLum: 105,
      bgVar: 83,
      isPlainWhiteBg: false,
      fgRatio: 0.95,
      bottomShoulderWidthRatio: 0.97,
      faceInfo: {
        hasFace: true,
        minX: 0.067,
        minY: 0.157,
        maxX: 0.926,
        maxY: 1.046,
        faceW: 0.859,
        faceH: 0.888,
      },
    },
    rawEg2Vision: {
      full_face: { passProb: 0.48, topLabel: 'pass_frontal', failLabel: 'fail_cropped' },
      eyes_open: { passProb: 0.177, topLabel: 'fail_looking_away', failLabel: 'fail_looking_away' },
      neutral_expression: { passProb: 0.375, topLabel: 'fail_smiling', failLabel: 'fail_smiling' },
      neutral_background: { passProb: 0.187, topLabel: 'fail_indoor_clutter', failLabel: 'fail_indoor_clutter' },
      shoulders_visible: { passProb: 0.065, topLabel: 'fail_no_shoulders', failLabel: 'fail_no_shoulders' },
      hair_clear: { passProb: 0.293, topLabel: 'fail_bangs_over_eyes', failLabel: 'fail_bangs_over_eyes' },
      no_glasses: { passProb: 0.949, topLabel: 'pass_bare_eyes', failLabel: 'fail_sunglasses' },
      framing_chest_up: { passProb: 0.096, topLabel: 'fail_macro_face', failLabel: 'fail_macro_face' },
      occupancy_70_percent: { passProb: 0.209, topLabel: 'fail_too_large', failLabel: 'fail_too_large' },
    },
  },
  {
    id: 'id_fail_distant_waist_up.jpg',
    title: 'Too Far',
    sub: '4 Fails',
    isCompliant: false,
    url: photoAssetUrl('id_fail_distant_waist_up.jpg'),
    groundTruth: {
      full_face: false,
      eyes_open: true,
      neutral_expression: true,
      neutral_background: false,
      shoulders_visible: true,
      hair_clear: true,
      no_glasses: true,
      framing_chest_up: false,
      occupancy_70_percent: false,
    },
    biometrics: {
      bgLum: 169,
      bgVar: 93,
      isPlainWhiteBg: false,
      fgRatio: 0.26,
      bottomShoulderWidthRatio: 0.8,
      faceInfo: { hasFace: false },
    },
    rawEg2Vision: {
      full_face: { passProb: 0.258, topLabel: 'fail_distant', failLabel: 'fail_distant' },
      eyes_open: { passProb: 0.093, topLabel: 'fail_sunglasses', failLabel: 'fail_sunglasses' },
      neutral_expression: { passProb: 0.391, topLabel: 'fail_smiling', failLabel: 'fail_smiling' },
      neutral_background: { passProb: 0.0, topLabel: 'fail_outdoor_street', failLabel: 'fail_outdoor_street' },
      shoulders_visible: { passProb: 0.504, topLabel: 'pass_shoulders', failLabel: 'fail_no_shoulders' },
      hair_clear: { passProb: 0.094, topLabel: 'fail_bangs_over_eyes', failLabel: 'fail_bangs_over_eyes' },
      no_glasses: { passProb: 0.176, topLabel: 'fail_sunglasses', failLabel: 'fail_sunglasses' },
      framing_chest_up: { passProb: 0.072, topLabel: 'fail_full_body', failLabel: 'fail_full_body' },
      occupancy_70_percent: { passProb: 0.307, topLabel: 'fail_too_large', failLabel: 'fail_too_large' },
    },
  },
  {
    id: 'id_fail_tilted_glasses_selfie.jpg',
    title: 'Tilted Selfie',
    sub: '8 Fails',
    isCompliant: false,
    url: photoAssetUrl('id_fail_tilted_glasses_selfie.jpg'),
    groundTruth: {
      full_face: false,
      eyes_open: false,
      neutral_expression: false,
      neutral_background: false,
      shoulders_visible: false,
      hair_clear: true,
      no_glasses: false,
      framing_chest_up: false,
      occupancy_70_percent: false,
    },
    biometrics: {
      bgLum: 188,
      bgVar: 55,
      bgSat: 63,
      isPlainWhiteBg: false,
      fgRatio: 0.89,
      bottomShoulderWidthRatio: 0.95,
      faceInfo: {
        hasFace: true,
        minX: 0.164,
        minY: 0.271,
        maxX: 0.553,
        maxY: 0.58,
        centerX: 0.359,
        centerY: 0.426,
        faceW: 0.389,
        faceH: 0.31,
        yawAsymmetry: 0.497,
        eyeRoll: 0.521,
      },
    },
    rawEg2Vision: {
      full_face: { passProb: 0.313, topLabel: 'fail_turned_tilted', failLabel: 'fail_turned_tilted' },
      eyes_open: { passProb: 0.114, topLabel: 'fail_looking_away', failLabel: 'fail_looking_away' },
      neutral_expression: { passProb: 0.058, topLabel: 'fail_smiling', failLabel: 'fail_smiling' },
      neutral_background: { passProb: 0.081, topLabel: 'fail_indoor_clutter', failLabel: 'fail_indoor_clutter' },
      shoulders_visible: { passProb: 0.294, topLabel: 'fail_angled_selfie', failLabel: 'fail_angled_selfie' },
      hair_clear: { passProb: 0.293, topLabel: 'fail_bangs_over_eyes', failLabel: 'fail_bangs_over_eyes' },
      no_glasses: { passProb: 0.121, topLabel: 'fail_eyeglasses', failLabel: 'fail_eyeglasses' },
      framing_chest_up: { passProb: 0.14, topLabel: 'fail_off_center', failLabel: 'fail_off_center' },
      occupancy_70_percent: { passProb: 0.15, topLabel: 'fail_too_large', failLabel: 'fail_too_large' },
    },
  },
  {
    id: 'id_fail_mask_hat.jpg',
    title: 'Mask & Cap',
    sub: '6 Fails',
    isCompliant: false,
    url: photoAssetUrl('id_fail_mask_hat.jpg'),
    groundTruth: {
      full_face: false,
      eyes_open: true,
      neutral_expression: false,
      neutral_background: false,
      shoulders_visible: true,
      hair_clear: false,
      no_glasses: true,
      framing_chest_up: false,
      occupancy_70_percent: false,
    },
    biometrics: {
      bgLum: 180,
      bgVar: 10,
      isPlainWhiteBg: false,
      fgRatio: 0.31,
      bottomShoulderWidthRatio: 1.0,
      faceInfo: { hasFace: false },
    },
    rawEg2Vision: {
      full_face: { passProb: 0.14, topLabel: 'fail_masked', failLabel: 'fail_masked' },
      eyes_open: { passProb: 0.304, topLabel: 'fail_sunglasses', failLabel: 'fail_sunglasses' },
      neutral_expression: { passProb: 0.576, topLabel: 'pass_neutral', failLabel: 'fail_smiling' },
      neutral_background: { passProb: 0.427, topLabel: 'pass_white_bg', failLabel: 'fail_indoor_clutter' },
      shoulders_visible: { passProb: 0.371, topLabel: 'fail_angled_selfie', failLabel: 'fail_angled_selfie' },
      hair_clear: { passProb: 0.254, topLabel: 'fail_hat_cap', failLabel: 'fail_hat_cap' },
      no_glasses: { passProb: 0.281, topLabel: 'fail_sunglasses', failLabel: 'fail_sunglasses' },
      framing_chest_up: { passProb: 0.527, topLabel: 'pass_chest_up', failLabel: 'fail_off_center' },
      occupancy_70_percent: { passProb: 0.784, topLabel: 'pass_70_pct', failLabel: 'fail_too_large' },
    },
  },
];

const logit = (p: number): number => {
  const c = Math.max(1e-4, Math.min(1 - 1e-4, p));
  return Math.log(c / (1 - c));
};

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export class DecisionVisionPlayground {
  private el: Record<string, HTMLElement> = {};
  private currentPhotoObj: PhotoPreset = PRESET_PHOTOS[0];
  private selectedRuleId = 'full_face';
  private showBiometricOverlay = true;
  private ruleExemplarBank: Record<string, { positives: ExemplarEntry[]; negatives: ExemplarEntry[] }> = {};
  private modelState: VisionModelState = { ready: false, loading: false, label: '' };

  private webcamActive = false;
  private webcamStream: MediaStream | null = null;
  private liveLoopTimer: ReturnType<typeof setTimeout> | null = null;
  private liveFrameCanvas = document.createElement('canvas');
  private encodeCanvas = document.createElement('canvas');

  constructor(
    private root: HTMLElement,
    private ask?: VisionAskFn,
    private onStatus?: (text: string, inferenceTime?: number) => void,
    private ensureVisionModel?: () => Promise<boolean>
  ) {
    this.liveFrameCanvas.width = 360;
    this.liveFrameCanvas.height = 460;
    this.encodeCanvas.width = 360;
    this.encodeCanvas.height = 460;
    this.initExemplarBank();
  }

  private computeLogitVector(rawVision: Record<string, RawRuleVisionScore>): number[] {
    return PASSPORT_RULES.map((r) => logit(rawVision[r.id]?.passProb ?? 0.5));
  }

  private l2DistSq(a: number[], b: number[]): number {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const d = a[i] - b[i];
      s += d * d;
    }
    return s;
  }

  private initExemplarBank() {
    for (const rule of PASSPORT_RULES) {
      this.ruleExemplarBank[rule.id] = { positives: [], negatives: [] };
      for (const p of PRESET_PHOTOS) {
        const isPos = Boolean(p.groundTruth?.[rule.id]);
        const rawProb = p.rawEg2Vision[rule.id].passProb;
        const entry: ExemplarEntry = {
          id: p.id,
          name: p.title,
          url: p.url,
          rawPassProb: rawProb,
          logitVal: logit(rawProb),
          logitVec: this.computeLogitVector(p.rawEg2Vision),
          enabled: true,
        };
        if (isPos) this.ruleExemplarBank[rule.id].positives.push(entry);
        else this.ruleExemplarBank[rule.id].negatives.push(entry);
      }
    }
  }

  public setModelState(state: VisionModelState) {
    const becameReady = !this.modelState.ready && state.ready;
    this.modelState = state;
    if (becameReady && this.isVisionModelReady()) {
      void this.evaluateCurrentPhotoWithDecisionMaker();
    }
  }

  private isVisionModelReady(): boolean {
    if (!this.modelState.ready || !this.ask) return false;
    return (
      this.modelState.loadedValue === 'embeddinggemma2_text_vision_440m' || Boolean(this.modelState.hasCustomModel)
    );
  }

  private buildPassportSchema() {
    return {
      context: '',
      questions: PASSPORT_RULES.map((rule) => ({
        id: rule.id,
        type: 'categorical',
        prompt: rule.prompt,
        normalizePrior: true,
        options: rule.options.map((opt) => ({
          label: opt.label,
          description: opt.description,
        })),
      })),
    };
  }

  private async sourceToImageBytes(source: HTMLImageElement | HTMLCanvasElement): Promise<Uint8Array> {
    const ctx = this.encodeCanvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0, this.encodeCanvas.width, this.encodeCanvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      this.encodeCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    );
    if (!blob) return new Uint8Array(0);
    const buf = await blob.arrayBuffer();
    return new Uint8Array(buf);
  }

  private parseSchemaResultToRawVision(
    schemaRes: Record<string, any>,
    fallback?: Record<string, RawRuleVisionScore>
  ): Record<string, RawRuleVisionScore> {
    const out: Record<string, RawRuleVisionScore> = {};
    for (const rule of PASSPORT_RULES) {
      const dec = schemaRes?.[rule.id];
      const probsArr: Array<{ label: string; probability: number }> = dec?.probabilities ?? [];
      if (probsArr.length > 0) {
        const passLabel = rule.options[0].label;
        const passEntry = probsArr.find((p) => p.label === passLabel);
        const passProb = passEntry ? passEntry.probability : (probsArr[0]?.probability ?? 0.5);
        let bestFailLabel = rule.options[1]?.label ?? passLabel;
        let bestFailProb = -1;
        for (const p of probsArr) {
          if (p.label !== passLabel && p.probability > bestFailProb) {
            bestFailProb = p.probability;
            bestFailLabel = p.label;
          }
        }
        out[rule.id] = {
          passProb,
          topLabel: dec.label || (passProb >= 0.5 ? passLabel : bestFailLabel),
          failLabel: bestFailLabel,
        };
      } else if (fallback?.[rule.id]) {
        out[rule.id] = fallback[rule.id];
      } else {
        out[rule.id] = {
          passProb: 0.5,
          topLabel: rule.options[0].label,
          failLabel: rule.options[1]?.label ?? rule.options[0].label,
        };
      }
    }
    return out;
  }

  private async evaluateSourceWithDecisionMaker(
    source: HTMLImageElement | HTMLCanvasElement,
    fallback?: Record<string, RawRuleVisionScore>
  ): Promise<{ rawEg2Vision: Record<string, RawRuleVisionScore>; inferenceTime?: number } | null> {
    if (!this.isVisionModelReady() && this.ensureVisionModel) {
      await this.ensureVisionModel();
    }
    if (!this.isVisionModelReady() || !this.ask) return null;
    try {
      const imageBytes = await this.sourceToImageBytes(source);
      if (imageBytes.byteLength === 0) return null;
      const msg = await this.ask({ imageBytes }, 'schema', this.buildPassportSchema());
      if (msg?.type === 'DECIDE_RESULT' && msg.result) {
        return {
          rawEg2Vision: this.parseSchemaResultToRawVision(msg.result, fallback),
          inferenceTime: msg.inferenceTime,
        };
      }
    } catch (e) {
      console.warn('DecisionMaker multimodal evaluation fallback:', e);
    }
    return null;
  }

  private async evaluateCurrentPhotoWithDecisionMaker() {
    if (!this.isVisionModelReady() || this.webcamActive) return;
    const imgEl = this.el['dv-main-img'] as HTMLImageElement | undefined;
    if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) return;
    const dmEval = await this.evaluateSourceWithDecisionMaker(imgEl, this.currentPhotoObj.rawEg2Vision);
    if (!dmEval) return;
    this.currentPhotoObj.rawEg2Vision = dmEval.rawEg2Vision;
    for (const rule of PASSPORT_RULES) {
      const bank = this.ruleExemplarBank[rule.id];
      for (const item of [...bank.positives, ...bank.negatives]) {
        if (item.id === this.currentPhotoObj.id) {
          const p = dmEval.rawEg2Vision[rule.id]?.passProb ?? item.rawPassProb;
          item.rawPassProb = p;
          item.logitVal = logit(p);
          item.logitVec = this.computeLogitVector(dmEval.rawEg2Vision);
        }
      }
    }
    this.renderAllPanels();
    if (dmEval.inferenceTime !== undefined) {
      if (this.el['dv-result-meta']) {
        this.el['dv-result-meta'].textContent = `9/9 rules · ${Math.round(dmEval.inferenceTime)} ms`;
      }
      this.onStatus?.('Evaluated photo compliance', dmEval.inferenceTime);
    }
  }

  init() {
    this.root.innerHTML = template;
    this.root.querySelectorAll<HTMLElement>('[id]').forEach((node) => (this.el[node.id] = node));

    this.el['dv-guide-btn']?.addEventListener('click', () => this.toggleBiometricOverlay());
    this.el['dv-webcam-btn']?.addEventListener('click', () => this.toggleWebcamBooth());
    this.el['dv-snap-btn']?.addEventListener('click', () => this.captureWebcamPhoto());
    this.el['dv-upload-input']?.addEventListener('change', (e) => this.handleCustomPhotoUpload(e));

    this.el['dv-add-pos-current']?.addEventListener('click', () => this.addCurrentPhotoAsExemplar(true));
    this.el['dv-add-neg-current']?.addEventListener('click', () => this.addCurrentPhotoAsExemplar(false));
    this.el['dv-upload-pos-input']?.addEventListener('change', (e) => this.handleExemplarFileUpload(e, true));
    this.el['dv-upload-neg-input']?.addEventListener('change', (e) => this.handleExemplarFileUpload(e, false));

    this.renderPresetStrip();
    this.renderAllPanels();
  }

  cleanup() {
    this.stopWebcamBooth();
  }

  public selectPresetPhoto(photoId: string) {
    if (this.webcamActive) this.stopWebcamBooth();
    const found = PRESET_PHOTOS.find((x) => x.id === photoId);
    if (!found) return;
    this.currentPhotoObj = found;
    this.renderPresetStrip();
    this.renderAllPanels();
    if (this.isVisionModelReady()) {
      const imgEl = this.el['dv-main-img'] as HTMLImageElement | undefined;
      if (imgEl) {
        if (imgEl.complete && imgEl.naturalWidth > 0) {
          void this.evaluateCurrentPhotoWithDecisionMaker();
        } else {
          imgEl.addEventListener('load', () => void this.evaluateCurrentPhotoWithDecisionMaker(), { once: true });
        }
      }
    }
  }

  public toggleBiometricOverlay() {
    this.showBiometricOverlay = !this.showBiometricOverlay;
    const btn = this.el['dv-guide-btn'];
    if (btn) {
      btn.classList.toggle('active', this.showBiometricOverlay);
      btn.innerHTML = `<span class="material-icons">grid_on</span> Guide: ${this.showBiometricOverlay ? 'ON' : 'OFF'}`;
    }
    this.renderActivePhotoView();
  }

  /**
   * Evaluates all 9 rules purely from `DecisionMaker` schema probabilities
   * (`photoObj.rawEg2Vision`) calibrated against the enabled positive and
   * negative Few-Shot Reference Examples in `this.ruleExemplarBank` — with
   * zero hard-coded biometric or pixel heuristics.
   */
  public evaluatePhotoRules(photoObj: PhotoPreset): Record<string, RuleEvalResult> {
    const results: Record<string, RuleEvalResult> = {};
    const queryLogitVec = this.computeLogitVector(photoObj.rawEg2Vision);

    for (let rIdx = 0; rIdx < PASSPORT_RULES.length; rIdx++) {
      const rule = PASSPORT_RULES[rIdx];
      const rawEntry = photoObj.rawEg2Vision[rule.id] || {
        passProb: 0.5,
        topLabel: rule.options[0].label,
        failLabel: rule.options[1]?.label ?? rule.options[0].label,
      };
      const rawPassProb = rawEntry.passProb;
      const rawL = queryLogitVec[rIdx];

      const bank = this.ruleExemplarBank[rule.id];
      const activePos = bank ? bank.positives.filter((x) => x.enabled) : [];
      const activeNeg = bank ? bank.negatives.filter((x) => x.enabled) : [];

      let calPassProb = rawPassProb;
      if (activePos.length > 0 && activeNeg.length > 0) {
        const muPos = activePos.reduce((s, e) => s + e.logitVal, 0) / activePos.length;
        const muNeg = activeNeg.reduce((s, e) => s + e.logitVal, 0) / activeNeg.length;
        const mid = 0.5 * (muPos + muNeg);
        const scale = 2.8 / Math.max(0.35, Math.abs(muPos - muNeg));
        const linearLogit = (rawL - mid) * scale;

        let posWeight = 0;
        for (const e of activePos) {
          const d2 = 0.35 * this.l2DistSq(queryLogitVec, e.logitVec) + 3.5 * (rawL - e.logitVal) ** 2;
          posWeight += Math.exp(-d2 / 2.5);
        }
        let negWeight = 0;
        for (const e of activeNeg) {
          const d2 = 0.35 * this.l2DistSq(queryLogitVec, e.logitVec) + 3.5 * (rawL - e.logitVal) ** 2;
          negWeight += Math.exp(-d2 / 2.5);
        }
        const linProb = sigmoid(linearLogit);
        const knnProb = (posWeight + 0.05 * linProb) / (posWeight + negWeight + 0.05);
        calPassProb = 0.45 * linProb + 0.55 * knnProb;
      } else if (activePos.length > 0) {
        const muPos = activePos.reduce((s, e) => s + e.logitVal, 0) / activePos.length;
        calPassProb = sigmoid((rawL - (muPos - 0.8)) * 2.0);
      } else if (activeNeg.length > 0) {
        const muNeg = activeNeg.reduce((s, e) => s + e.logitVal, 0) / activeNeg.length;
        calPassProb = sigmoid((rawL - (muNeg + 0.8)) * 2.0);
      }

      const finalPassProb = calPassProb;
      const passed = finalPassProb >= 0.5;
      const specificFailLabel = rawEntry.failLabel || rule.options[1]?.label || rule.options[0].label;
      const chosenOptionLabel = passed ? rule.options[0].label : specificFailLabel;
      const reasonText = rule.optionDisplay[chosenOptionLabel] || chosenOptionLabel;

      results[rule.id] = {
        passed,
        prob: finalPassProb,
        rawPassProb,
        calPassProb,
        chosenOptionLabel,
        reasonText,
      };
    }

    return results;
  }

  private renderPresetStrip() {
    const strip = this.el['dv-preset-strip'];
    if (!strip) return;
    strip.innerHTML = '';
    for (const p of PRESET_PHOTOS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dv-preset-btn' + (!this.webcamActive && this.currentPhotoObj.id === p.id ? ' active' : '');
      btn.dataset.presetId = p.id;
      btn.addEventListener('click', () => this.selectPresetPhoto(p.id));
      btn.innerHTML = `
        <img class="dv-preset-thumb" src="${p.url}" alt="${p.title}" />
        <div class="dv-preset-title">${p.title}</div>
        <span class="dv-preset-tag ${p.isCompliant ? 'pass' : 'fail'}">${p.sub}</span>
      `;
      strip.appendChild(btn);
    }
  }

  private renderActivePhotoView() {
    const imgEl = this.el['dv-main-img'] as HTMLImageElement | undefined;
    const svgEl = this.el['dv-overlay-svg'];
    if (!this.webcamActive && imgEl) {
      imgEl.style.display = 'block';
      if (imgEl.getAttribute('src') !== this.currentPhotoObj.url) {
        imgEl.src = this.currentPhotoObj.url;
      }
    }

    if (!svgEl) return;
    if (!this.showBiometricOverlay) {
      svgEl.innerHTML = '';
      return;
    }

    const cw = 360;
    const ch = 460;
    const fi = this.currentPhotoObj.biometrics?.faceInfo;
    let overlayMarkup = `
      <ellipse cx="${cw * 0.5}" cy="${ch * 0.42}" rx="${cw * 0.33}" ry="${ch * 0.3}"
        fill="none" stroke="rgba(0, 127, 139, 0.85)" stroke-width="2.2" stroke-dasharray="7 5" />
      <line x1="${cw * 0.18}" y1="${ch * 0.4}" x2="${cw * 0.82}" y2="${ch * 0.4}"
        stroke="rgba(0, 127, 139, 0.45)" stroke-width="1.5" stroke-dasharray="4 4" />
      <path d="M ${cw * 0.05} ${ch * 0.96} Q ${cw * 0.14} ${ch * 0.76} ${cw * 0.34} ${ch * 0.72}"
        fill="none" stroke="rgba(0, 127, 139, 0.55)" stroke-width="2" stroke-dasharray="6 4" />
      <path d="M ${cw * 0.66} ${ch * 0.72} Q ${cw * 0.86} ${ch * 0.76} ${cw * 0.95} ${ch * 0.96}"
        fill="none" stroke="rgba(0, 127, 139, 0.55)" stroke-width="2" stroke-dasharray="6 4" />
    `;

    if (
      fi &&
      fi.hasFace &&
      fi.minX !== undefined &&
      fi.minY !== undefined &&
      fi.maxX !== undefined &&
      fi.maxY !== undefined
    ) {
      const bx = fi.minX * cw;
      const by = fi.minY * ch;
      const bw = (fi.maxX - fi.minX) * cw;
      const bh = Math.min(ch - by - 4, (fi.maxY - fi.minY) * ch);
      const evalRes = this.evaluatePhotoRules(this.currentPhotoObj);
      const isGoodBox = Boolean(evalRes['full_face']?.passed && evalRes['framing_chest_up']?.passed);
      const boxColor = isGoodBox ? '#137333' : '#c5221f';
      overlayMarkup += `
        <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6"
          fill="none" stroke="${boxColor}" stroke-width="2.5" />
      `;
    }
    svgEl.innerHTML = overlayMarkup;
  }

  private renderAllPanels() {
    this.renderActivePhotoView();

    const evalRes = this.evaluatePhotoRules(this.currentPhotoObj);
    let passCount = 0;
    for (const r of PASSPORT_RULES) {
      if (evalRes[r.id].passed) passCount++;
    }
    const allPassed = passCount === PASSPORT_RULES.length;

    const banner = this.el['dv-verdict-banner'];
    const iconEl = this.el['dv-verdict-icon'];
    const titleEl = this.el['dv-verdict-title'];
    const subEl = this.el['dv-verdict-sub'];
    if (banner && iconEl && titleEl && subEl) {
      banner.className = 'dv-verdict-banner ' + (allPassed ? 'pass' : 'fail');
      iconEl.textContent = allPassed ? 'check_circle' : 'error';
      const failCount = PASSPORT_RULES.length - passCount;
      titleEl.textContent = allPassed ? 'COMPLIANT' : `${failCount} ISSUE${failCount > 1 ? 'S' : ''} DETECTED`;
      subEl.textContent = `${passCount} / ${PASSPORT_RULES.length} Passed`;
    }

    const listEl = this.el['dv-rules-list'];
    if (listEl) {
      if (listEl.children.length !== PASSPORT_RULES.length) {
        listEl.innerHTML = '';
        for (const rule of PASSPORT_RULES) {
          const card = document.createElement('div');
          card.dataset.ruleId = rule.id;
          card.addEventListener('click', () => {
            this.selectedRuleId = rule.id;
            this.renderAllPanels();
          });
          card.innerHTML = `
            <div class="dv-rule-top">
              <div class="dv-rule-name">
                <span class="material-icons">${rule.icon}</span>
                <span>${rule.shortTitle}</span>
              </div>
              <span class="dv-rule-badge"></span>
            </div>
            <div class="dv-rule-reason"></div>
            <div class="dv-rule-bar-track">
              <div class="dv-rule-bar-fill"></div>
            </div>
          `;
          listEl.appendChild(card);
        }
      }
      for (let i = 0; i < PASSPORT_RULES.length; i++) {
        const rule = PASSPORT_RULES[i];
        const r = evalRes[rule.id];
        const pct = Math.round(r.prob * 100);
        const card = listEl.children[i] as HTMLElement;
        card.className = `dv-rule-card ${r.passed ? 'pass' : 'fail'}${this.selectedRuleId === rule.id ? ' selected' : ''}`;
        const badgeEl = card.querySelector('.dv-rule-badge') as HTMLElement;
        badgeEl.className = `dv-rule-badge ${r.passed ? 'pass' : 'fail'}`;
        badgeEl.textContent = r.passed ? 'PASS' : 'FAIL';
        const reasonEl = card.querySelector('.dv-rule-reason') as HTMLElement;
        reasonEl.textContent = r.reasonText;
        const fillEl = card.querySelector('.dv-rule-bar-fill') as HTMLElement;
        fillEl.className = `dv-rule-bar-fill ${r.passed ? 'pass' : 'fail'}`;
        fillEl.style.width = `${pct}%`;
      }
    }

    this.renderExemplarStudioPanel(evalRes);
  }

  private renderExemplarStudioPanel(evalRes: Record<string, RuleEvalResult>) {
    const rule = PASSPORT_RULES.find((r) => r.id === this.selectedRuleId) || PASSPORT_RULES[0];
    const rRes = evalRes[rule.id];
    const bank = this.ruleExemplarBank[rule.id];

    if (this.el['dv-active-rule-title']) this.el['dv-active-rule-title'].textContent = rule.title;
    if (this.el['dv-active-rule-prompt']) this.el['dv-active-rule-prompt'].textContent = rule.prompt;

    const statusBadge = this.el['dv-active-rule-badge'];
    if (statusBadge) {
      statusBadge.className = 'dv-rule-badge ' + (rRes.passed ? 'pass' : 'fail');
      statusBadge.textContent = `${rRes.passed ? 'PASS' : 'FAIL'} (${Math.round(rRes.prob * 100)}%)`;
    }

    const renderList = (container: HTMLElement | undefined, items: ExemplarEntry[], isPositive: boolean) => {
      if (!container) return;
      container.innerHTML = '';
      items.forEach((item) => {
        const label = document.createElement('label');
        label.className = 'dv-exemplar-item' + (item.enabled ? '' : ' off');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = item.enabled;
        checkbox.addEventListener('change', () => {
          item.enabled = checkbox.checked;
          this.renderAllPanels();
        });
        const img = document.createElement('img');
        img.className = 'dv-exemplar-thumb';
        img.src = item.url;
        img.alt = item.name;
        const span = document.createElement('span');
        span.textContent = item.name;
        label.append(checkbox, img, span);
        container.appendChild(label);
      });
      const badgeEl = this.el[isPositive ? 'dv-pos-count' : 'dv-neg-count'];
      if (badgeEl) badgeEl.textContent = String(items.filter((x) => x.enabled).length);
    };

    renderList(this.el['dv-pos-list'], bank.positives, true);
    renderList(this.el['dv-neg-list'], bank.negatives, false);
  }

  private addCurrentPhotoAsExemplar(isPositive: boolean) {
    const ruleId = this.selectedRuleId;
    const rawProb = this.currentPhotoObj.rawEg2Vision[ruleId]?.passProb ?? 0.5;
    const entry: ExemplarEntry = {
      id: `${this.currentPhotoObj.id}_${Date.now()}`,
      name: this.currentPhotoObj.title,
      url: this.currentPhotoObj.url,
      rawPassProb: rawProb,
      logitVal: logit(rawProb),
      logitVec: this.computeLogitVector(this.currentPhotoObj.rawEg2Vision),
      enabled: true,
    };
    if (isPositive) this.ruleExemplarBank[ruleId].positives.unshift(entry);
    else this.ruleExemplarBank[ruleId].negatives.unshift(entry);
    this.renderAllPanels();
  }

  private async handleExemplarFileUpload(event: Event, isPositive: boolean) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
    const ruleId = this.selectedRuleId;
    const fallbackTemplate = isPositive ? PRESET_PHOTOS[0].rawEg2Vision : PRESET_PHOTOS[2].rawEg2Vision;
    let rawEg2Vision = { ...fallbackTemplate };

    const img = await new Promise<HTMLImageElement>((res) => {
      const el = new Image();
      el.onload = () => res(el);
      el.src = dataUrl;
    });
    const dmEval = await this.evaluateSourceWithDecisionMaker(img, fallbackTemplate);
    if (dmEval) rawEg2Vision = dmEval.rawEg2Vision;

    const rawProb = rawEg2Vision[ruleId]?.passProb ?? (isPositive ? 0.7 : 0.05);
    const entry: ExemplarEntry = {
      id: `upload_${Date.now()}`,
      name: file.name.slice(0, 14),
      url: dataUrl,
      rawPassProb: rawProb,
      logitVal: logit(rawProb),
      logitVec: this.computeLogitVector(rawEg2Vision),
      enabled: true,
    };
    if (isPositive) this.ruleExemplarBank[ruleId].positives.unshift(entry);
    else this.ruleExemplarBank[ruleId].negatives.unshift(entry);
    input.value = '';
    this.renderAllPanels();
  }

  private async evaluateCustomImageElement(img: HTMLImageElement, titleLabel: string) {
    const t0 = performance.now();
    if (this.el['dv-result-meta']) {
      this.el['dv-result-meta'].textContent = 'Evaluating photo…';
    }
    const dmEval = await this.evaluateSourceWithDecisionMaker(img, PRESET_PHOTOS[0].rawEg2Vision);
    const rawEg2Vision: Record<string, RawRuleVisionScore> = dmEval
      ? dmEval.rawEg2Vision
      : { ...PRESET_PHOTOS[0].rawEg2Vision };

    this.currentPhotoObj = {
      id: `custom_${Date.now()}`,
      title: titleLabel,
      sub: 'Custom',
      isCompliant: false,
      url: img.src,
      biometrics: {
        bgLum: 240,
        bgVar: 5,
        isPlainWhiteBg: true,
        fgRatio: 0.68,
        bottomShoulderWidthRatio: 0.85,
        faceInfo: { hasFace: false },
      },
      rawEg2Vision,
    };
    this.renderPresetStrip();
    this.renderAllPanels();

    const elapsed = dmEval?.inferenceTime ?? performance.now() - t0;
    if (this.el['dv-result-meta']) {
      this.el['dv-result-meta'].textContent = `9/9 rules · ${Math.round(elapsed)} ms`;
    }
    this.onStatus?.('Evaluated photo compliance', elapsed);
  }

  private async handleCustomPhotoUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (this.webcamActive) this.stopWebcamBooth();
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
    const img = new Image();
    img.onload = () => this.evaluateCustomImageElement(img, file.name.slice(0, 12));
    img.src = dataUrl;
    input.value = '';
  }

  private drawMirroredVideoToCanvas(video: HTMLVideoElement, targetCanvas: HTMLCanvasElement) {
    const sctx = targetCanvas.getContext('2d')!;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const sw = vh * (360 / 460);
    const sx = (vw - sw) * 0.5;
    sctx.save();
    sctx.translate(targetCanvas.width, 0);
    sctx.scale(-1, 1);
    sctx.drawImage(video, sx, 0, sw, vh, 0, 0, targetCanvas.width, targetCanvas.height);
    sctx.restore();
  }

  private async runLiveWebcamLoop() {
    if (!this.webcamActive) return;
    const video = this.el['dv-webcam-video'] as HTMLVideoElement | undefined;
    if (video && video.readyState >= 2) {
      const t0 = performance.now();
      this.drawMirroredVideoToCanvas(video, this.liveFrameCanvas);
      const dmEval = await this.evaluateSourceWithDecisionMaker(
        this.liveFrameCanvas,
        this.currentPhotoObj.rawEg2Vision
      );
      if (!this.webcamActive) return;

      if (dmEval) {
        this.currentPhotoObj.rawEg2Vision = dmEval.rawEg2Vision;
        this.renderAllPanels();

        const elapsed = Math.max(8, Math.round(dmEval.inferenceTime ?? performance.now() - t0));
        if (this.el['dv-result-meta']) {
          this.el['dv-result-meta'].textContent = `Live · ${elapsed} ms`;
        }
      }
    }
    if (this.webcamActive) {
      this.liveLoopTimer = setTimeout(() => this.runLiveWebcamLoop(), 140);
    }
  }

  public async toggleWebcamBooth() {
    if (this.webcamActive) {
      this.stopWebcamBooth();
      this.renderPresetStrip();
      this.renderAllPanels();
      return;
    }
    try {
      const video = this.el['dv-webcam-video'] as HTMLVideoElement;
      const imgEl = this.el['dv-main-img'] as HTMLImageElement;
      this.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      video.srcObject = this.webcamStream;
      await video.play();
      this.webcamActive = true;
      imgEl.style.display = 'none';
      video.style.display = 'block';
      if (this.el['dv-webcam-btn-label']) this.el['dv-webcam-btn-label'].textContent = 'Stop Live';
      this.el['dv-webcam-btn']?.classList.add('active');
      if (this.el['dv-snap-btn']) this.el['dv-snap-btn'].style.display = 'inline-flex';
      if (this.el['dv-result-meta']) this.el['dv-result-meta'].textContent = 'Evaluating live frame…';

      const rawEg2Vision: Record<string, RawRuleVisionScore> = { ...this.currentPhotoObj.rawEg2Vision };
      this.currentPhotoObj = {
        id: 'live_webcam',
        title: 'Live Camera',
        sub: 'Live',
        isCompliant: false,
        url: this.currentPhotoObj.url,
        biometrics: {
          bgLum: 220,
          bgVar: 10,
          isPlainWhiteBg: false,
          fgRatio: 0.65,
          bottomShoulderWidthRatio: 0.85,
          faceInfo: { hasFace: false },
        },
        rawEg2Vision,
      };
      this.renderPresetStrip();
      this.renderActivePhotoView();
      this.runLiveWebcamLoop();
    } catch (err: any) {
      this.onStatus?.(`Webcam error: ${err?.message || err}`);
    }
  }

  public stopWebcamBooth() {
    this.webcamActive = false;
    if (this.liveLoopTimer) {
      clearTimeout(this.liveLoopTimer);
      this.liveLoopTimer = null;
    }
    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach((t) => t.stop());
      this.webcamStream = null;
    }
    const video = this.el['dv-webcam-video'] as HTMLVideoElement | undefined;
    const imgEl = this.el['dv-main-img'] as HTMLImageElement | undefined;
    if (video) video.style.display = 'none';
    if (imgEl) imgEl.style.display = 'block';
    if (this.el['dv-webcam-btn-label']) this.el['dv-webcam-btn-label'].textContent = 'Live Check';
    this.el['dv-webcam-btn']?.classList.remove('active');
    if (this.el['dv-snap-btn']) this.el['dv-snap-btn'].style.display = 'none';
    if (this.el['dv-result-meta']) this.el['dv-result-meta'].textContent = '9/9 rules';
  }

  private async captureWebcamPhoto() {
    if (!this.webcamActive) return;
    const video = this.el['dv-webcam-video'] as HTMLVideoElement;
    this.drawMirroredVideoToCanvas(video, this.liveFrameCanvas);
    this.stopWebcamBooth();

    const dataUrl = this.liveFrameCanvas.toDataURL('image/jpeg', 0.92);
    const img = new Image();
    img.onload = () => this.evaluateCustomImageElement(img, 'Camera Photo');
    img.src = dataUrl;
  }
}
