export interface ICD10Code {
  code: string
  description: string
}

export const ICD10_CODES: ICD10Code[] = [
  // Infectious diseases
  { code: 'A09', description: 'Infectious gastroenteritis and colitis, unspecified' },
  { code: 'A41.9', description: 'Sepsis, unspecified organism' },
  { code: 'A49.9', description: 'Bacterial infection, unspecified' },
  { code: 'B34.9', description: 'Viral infection, unspecified' },
  // Neoplasms
  { code: 'C18.9', description: 'Malignant neoplasm of colon, unspecified' },
  { code: 'C34.10', description: 'Malignant neoplasm of upper lobe, unspecified bronchus or lung' },
  { code: 'C50.911', description: 'Malignant neoplasm of unspecified site of right female breast' },
  { code: 'C61', description: 'Malignant neoplasm of prostate' },
  // Endocrine / metabolic
  { code: 'E03.9', description: 'Hypothyroidism, unspecified' },
  { code: 'E05.90', description: 'Thyrotoxicosis (hyperthyroidism), unspecified' },
  { code: 'E10.9', description: 'Type 1 diabetes mellitus without complications' },
  { code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycemia' },
  { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
  { code: 'E66.9', description: 'Obesity, unspecified' },
  // Mental health
  { code: 'F20.9', description: 'Schizophrenia, unspecified' },
  { code: 'F31.9', description: 'Bipolar disorder, unspecified' },
  { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified' },
  { code: 'F41.1', description: 'Generalized anxiety disorder' },
  { code: 'F41.9', description: 'Anxiety disorder, unspecified' },
  { code: 'F43.10', description: 'Post-traumatic stress disorder, unspecified' },
  { code: 'F90.9', description: 'Attention-deficit hyperactivity disorder, unspecified type' },
  // Eye
  { code: 'H25.811', description: 'Combined forms of age-related cataract, right eye' },
  { code: 'H40.1130', description: 'Primary open-angle glaucoma, bilateral, stage unspecified' },
  { code: 'H52.4', description: 'Presbyopia' },
  // Cardiovascular
  { code: 'I10', description: 'Essential (primary) hypertension' },
  { code: 'I21.9', description: 'Acute myocardial infarction, unspecified' },
  { code: 'I25.10', description: 'Atherosclerotic heart disease of native coronary artery without angina' },
  { code: 'I48.91', description: 'Unspecified atrial fibrillation' },
  { code: 'I50.9', description: 'Heart failure, unspecified' },
  { code: 'I63.9', description: 'Cerebral infarction (stroke), unspecified' },
  // Respiratory
  { code: 'J00', description: 'Acute nasopharyngitis (common cold)' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
  { code: 'J18.9', description: 'Pneumonia, unspecified organism' },
  { code: 'J20.9', description: 'Acute bronchitis, unspecified' },
  { code: 'J30.1', description: 'Allergic rhinitis due to pollen (hay fever)' },
  { code: 'J30.9', description: 'Allergic rhinitis, unspecified' },
  { code: 'J44.1', description: 'COPD with acute exacerbation' },
  { code: 'J45.20', description: 'Mild intermittent asthma, uncomplicated' },
  { code: 'J45.40', description: 'Moderate persistent asthma, uncomplicated' },
  { code: 'J45.50', description: 'Severe persistent asthma, uncomplicated' },
  // Digestive
  { code: 'K21.0', description: 'Gastroesophageal reflux disease with esophagitis (GERD)' },
  { code: 'K21.9', description: 'Gastroesophageal reflux disease without esophagitis (GERD)' },
  { code: 'K29.70', description: 'Gastritis, unspecified, without bleeding' },
  { code: 'K35.80', description: 'Acute appendicitis without abscess' },
  { code: 'K58.9', description: 'Irritable bowel syndrome without diarrhea' },
  { code: 'K59.00', description: 'Constipation, unspecified' },
  // Skin
  { code: 'L03.90', description: 'Cellulitis, unspecified' },
  { code: 'L30.9', description: 'Dermatitis, unspecified' },
  { code: 'L50.0', description: 'Allergic urticaria (hives)' },
  // Musculoskeletal
  { code: 'M17.11', description: 'Primary osteoarthritis, right knee' },
  { code: 'M17.12', description: 'Primary osteoarthritis, left knee' },
  { code: 'M25.511', description: 'Pain in right shoulder' },
  { code: 'M25.512', description: 'Pain in left shoulder' },
  { code: 'M54.2', description: 'Cervicalgia (neck pain)' },
  { code: 'M54.50', description: 'Low back pain, unspecified' },
  { code: 'M79.7', description: 'Fibromyalgia' },
  { code: 'M81.0', description: 'Age-related osteoporosis without current pathological fracture' },
  // Genitourinary
  { code: 'N20.0', description: 'Calculus of kidney (kidney stone)' },
  { code: 'N39.0', description: 'Urinary tract infection, site not specified' },
  { code: 'N40.0', description: 'Benign prostatic hyperplasia without lower urinary tract symptoms' },
  { code: 'N93.9', description: 'Abnormal uterine and vaginal bleeding, unspecified' },
  // Pregnancy
  { code: 'O09.90', description: 'Supervision of high risk pregnancy, unspecified' },
  { code: 'O80', description: 'Encounter for full-term uncomplicated delivery' },
  // Symptoms and signs
  { code: 'R00.0', description: 'Tachycardia (rapid heart rate), unspecified' },
  { code: 'R00.1', description: 'Bradycardia (slow heart rate), unspecified' },
  { code: 'R05.9', description: 'Cough, unspecified' },
  { code: 'R06.00', description: 'Dyspnea (shortness of breath), unspecified' },
  { code: 'R07.9', description: 'Chest pain, unspecified' },
  { code: 'R10.9', description: 'Abdominal pain, unspecified' },
  { code: 'R11.0', description: 'Nausea' },
  { code: 'R11.10', description: 'Vomiting, unspecified' },
  { code: 'R11.2', description: 'Nausea with vomiting, unspecified' },
  { code: 'R42', description: 'Dizziness and giddiness' },
  { code: 'R50.9', description: 'Fever, unspecified' },
  { code: 'R51.9', description: 'Headache, unspecified' },
  { code: 'R53.83', description: 'Other fatigue' },
  { code: 'R55', description: 'Syncope (fainting) and collapse' },
  { code: 'R73.09', description: 'Other abnormal glucose' },
  // Injuries
  { code: 'S09.90XA', description: 'Unspecified injury of head, initial encounter' },
  { code: 'S39.91XA', description: 'Unspecified injury of abdomen, initial encounter' },
  { code: 'S72.001A', description: 'Fracture of neck of right femur, unspecified, initial encounter' },
  { code: 'T14.90', description: 'Injury, unspecified' },
  // Preventive / encounters
  { code: 'Z00.00', description: 'General adult medical examination without abnormal findings' },
  { code: 'Z12.11', description: 'Encounter for screening for malignant neoplasm of colon' },
  { code: 'Z23', description: 'Encounter for immunization' },
  { code: 'Z51.11', description: 'Encounter for antineoplastic chemotherapy' },
]

export const ICD10_MAP = new Map(ICD10_CODES.map((c) => [c.code, c.description]))
