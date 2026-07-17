import { LearningResource } from '../types';

export const learningResources: LearningResource[] = [
  // AWS SAA Resources
  { id: 'r1', certificationId: 'aws-saa', title: 'AWS Certified Solutions Architect Official Study Guide', provider: 'AWS', url: 'https://aws.amazon.com/certification/certified-solutions-architect-associate/', duration: '40 hours', free: false, type: 'book', aiReason: 'Official study material covering all exam domains comprehensively' },
  { id: 'r2', certificationId: 'aws-saa', title: 'AWS Skill Builder - Solutions Architect Learning Path', provider: 'AWS Skill Builder', url: 'https://skillbuilder.aws/', duration: '30 hours', free: true, type: 'course', aiReason: 'Free official training directly from AWS with hands-on labs' },
  { id: 'r3', certificationId: 'aws-saa', title: 'Stephane Maarek - Ultimate AWS SAA Course', provider: 'Udemy', url: 'https://www.udemy.com/course/aws-certified-solutions-architect-associate-saa-c03/', duration: '27 hours', free: false, type: 'course', aiReason: 'Highest-rated SAA course with 900K+ students, regularly updated' },
  { id: 'r4', certificationId: 'aws-saa', title: 'AWS Well-Architected Framework', provider: 'AWS Documentation', url: 'https://docs.aws.amazon.com/wellarchitected/latest/framework/', duration: '8 hours', free: true, type: 'documentation', aiReason: 'Essential reading — exam questions are heavily based on these principles' },
  { id: 'r5', certificationId: 'aws-saa', title: 'Tutorial Dojo Practice Exams', provider: 'Tutorial Dojo', url: 'https://tutorialsdojo.com/aws-certified-solutions-architect-associate-saa-c03/', duration: '10 hours', free: false, type: 'practice-exam', aiReason: 'Closest to actual exam format, excellent for identifying knowledge gaps' },

  // AZ-900 Resources
  { id: 'r6', certificationId: 'az-900', title: 'Microsoft Learn - Azure Fundamentals Path', provider: 'Microsoft Learn', url: 'https://learn.microsoft.com/en-us/training/paths/az-900-describe-cloud-concepts/', duration: '10 hours', free: true, type: 'course', aiReason: 'Official free training with interactive exercises and knowledge checks' },
  { id: 'r7', certificationId: 'az-900', title: 'AZ-900 Azure Fundamentals Exam Prep', provider: 'YouTube', url: 'https://www.youtube.com/watch?v=NKEFWlXjtIg', duration: '3 hours', free: true, type: 'video', aiReason: 'Comprehensive free crash course perfect for last-minute revision' },
  { id: 'r8', certificationId: 'az-900', title: 'Azure Fundamentals (AZ-900) Course', provider: 'Coursera', url: 'https://www.coursera.org/learn/microsoft-azure-fundamentals', duration: '15 hours', free: false, type: 'course', aiReason: 'Structured learning with graded assessments and certificate of completion' },

  // CompTIA Security+
  { id: 'r9', certificationId: 'comptia-security-plus', title: 'CompTIA Security+ Study Guide', provider: 'CompTIA', url: 'https://www.comptia.org/training/books/security-sy0-701-study-guide', duration: '45 hours', free: false, type: 'book', aiReason: 'Official study guide aligned with current exam objectives' },
  { id: 'r10', certificationId: 'comptia-security-plus', title: 'Professor Messer Security+ Course', provider: 'YouTube', url: 'https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-plus-course/', duration: '20 hours', free: true, type: 'video', aiReason: 'Industry-favorite free resource, clear explanations of every exam objective' },
  { id: 'r11', certificationId: 'comptia-security-plus', title: 'Security+ Practice Tests', provider: 'Udemy', url: 'https://www.udemy.com/course/comptia-security-practice-tests/', duration: '8 hours', free: false, type: 'practice-exam', aiReason: 'Most realistic practice tests with detailed explanations' },

  // CCNA Resources
  { id: 'r12', certificationId: 'cisco-ccna', title: 'Cisco Skills for All - Networking Essentials', provider: 'Cisco Skills for All', url: 'https://skillsforall.com/course/networking-essentials', duration: '70 hours', free: true, type: 'course', aiReason: 'Free official Cisco training with packet tracer labs' },
  { id: 'r13', certificationId: 'cisco-ccna', title: 'Neil Anderson Complete CCNA Course', provider: 'Udemy', url: 'https://www.udemy.com/course/ccna-complete/', duration: '60 hours', free: false, type: 'course', aiReason: 'Most comprehensive CCNA course with lab exercises' },
  { id: 'r14', certificationId: 'cisco-ccna', title: 'Cisco CCNA Documentation', provider: 'Cisco Documentation', url: 'https://www.cisco.com/c/en/us/training-events/training-certifications/certifications/associate/ccna.html', duration: '30 hours', free: true, type: 'documentation', aiReason: 'Official exam topics and study materials from Cisco' },

  // PMP Resources
  { id: 'r15', certificationId: 'pmp', title: 'PMBOK Guide 7th Edition', provider: 'PMI', url: 'https://www.pmi.org/pmbok-guide-standards/foundational/pmbok', duration: '60 hours', free: false, type: 'book', aiReason: 'Essential reference guide — the primary source for exam questions' },
  { id: 'r16', certificationId: 'pmp', title: 'Joseph Phillips PMP Prep Course', provider: 'Udemy', url: 'https://www.udemy.com/course/pmp-pmbok6-35-pdus/', duration: '35 hours', free: false, type: 'course', aiReason: 'Fulfills 35 contact hour requirement, highest-rated PMP course' },
  { id: 'r17', certificationId: 'pmp', title: 'PMI Practice Exam', provider: 'PMI', url: 'https://www.pmi.org/certifications/project-management-pmp/exam-prep', duration: '10 hours', free: false, type: 'practice-exam', aiReason: 'Official PMI practice questions — closest to actual exam' },

  // CKA Resources
  { id: 'r18', certificationId: 'cka', title: 'Kubernetes Documentation', provider: 'Kubernetes', url: 'https://kubernetes.io/docs/home/', duration: '40 hours', free: true, type: 'documentation', aiReason: 'Allowed during exam — mastering navigation is a huge advantage' },
  { id: 'r19', certificationId: 'cka', title: 'CKA with Practice Tests', provider: 'Udemy', url: 'https://www.udemy.com/course/certified-kubernetes-administrator-with-practice-tests/', duration: '17 hours', free: false, type: 'course', aiReason: 'KodeKloud lab environment included for hands-on practice' },
  { id: 'r20', certificationId: 'cka', title: 'Killer.sh CKA Simulator', provider: 'Killer.sh', url: 'https://killer.sh/', duration: '4 hours', free: false, type: 'practice-exam', aiReason: 'Included with exam purchase, harder than real exam — great preparation' },

  // Azure AZ-104
  { id: 'r21', certificationId: 'az-104', title: 'Microsoft Learn - Azure Administrator Path', provider: 'Microsoft Learn', url: 'https://learn.microsoft.com/en-us/training/paths/az-104-administrator-prerequisites/', duration: '25 hours', free: true, type: 'course', aiReason: 'Official free learning path with sandbox labs' },
  { id: 'r22', certificationId: 'az-104', title: 'AZ-104 Azure Administrator Course', provider: 'Coursera', url: 'https://www.coursera.org/professional-certificates/microsoft-azure-administrator', duration: '40 hours', free: false, type: 'course', aiReason: 'Structured Microsoft-official course with graded projects' },

  // Terraform
  { id: 'r23', certificationId: 'terraform-associate', title: 'HashiCorp Terraform Documentation', provider: 'HashiCorp', url: 'https://developer.hashicorp.com/terraform/docs', duration: '20 hours', free: true, type: 'documentation', aiReason: 'Official docs cover every exam topic in depth' },
  { id: 'r24', certificationId: 'terraform-associate', title: 'Terraform Associate Study Guide', provider: 'Udemy', url: 'https://www.udemy.com/course/terraform-beginner-to-advanced/', duration: '12 hours', free: false, type: 'course', aiReason: 'Hands-on course with real-world infrastructure projects' },

  // GCP ACE
  { id: 'r25', certificationId: 'gcp-ace', title: 'Google Cloud Skills Boost', provider: 'Google Cloud Skills Boost', url: 'https://www.cloudskillsboost.google/', duration: '40 hours', free: true, type: 'course', aiReason: 'Official Google training with Qwiklabs hands-on exercises' },
  { id: 'r26', certificationId: 'gcp-ace', title: 'GCP ACE Course', provider: 'Coursera', url: 'https://www.coursera.org/professional-certificates/cloud-engineering-gcp', duration: '30 hours', free: false, type: 'course', aiReason: 'Google-official professional certificate on Coursera' },

  // AI-900
  { id: 'r27', certificationId: 'ai-900', title: 'Microsoft Learn - AI Fundamentals Path', provider: 'Microsoft Learn', url: 'https://learn.microsoft.com/en-us/training/paths/get-started-with-artificial-intelligence-on-azure/', duration: '8 hours', free: true, type: 'course', aiReason: 'Official free path covering all AI-900 exam objectives' },

  // TensorFlow Developer
  { id: 'r28', certificationId: 'tf-developer', title: 'DeepLearning.AI TensorFlow Developer Specialization', provider: 'Coursera', url: 'https://www.coursera.org/professional-certificates/tensorflow-in-practice', duration: '40 hours', free: false, type: 'course', aiReason: 'Created by Laurence Moroney (Google) — directly aligned with exam content' },
  { id: 'r29', certificationId: 'tf-developer', title: 'TensorFlow Official Tutorials', provider: 'TensorFlow', url: 'https://www.tensorflow.org/tutorials', duration: '20 hours', free: true, type: 'documentation', aiReason: 'Official tutorials with runnable Colab notebooks' },

  // PSM I
  { id: 'r30', certificationId: 'psm-1', title: 'The Scrum Guide', provider: 'Scrum.org', url: 'https://scrumguides.org/', duration: '1 hour', free: true, type: 'documentation', aiReason: 'THE primary source — every exam question derives from this 13-page guide' },
  { id: 'r31', certificationId: 'psm-1', title: 'Scrum.org Open Assessments', provider: 'Scrum.org', url: 'https://www.scrum.org/open-assessments', duration: '3 hours', free: true, type: 'practice-exam', aiReason: 'Free official practice tests — aim for 100% before taking the exam' },
];

export function getResourcesForCertification(certId: string): LearningResource[] {
  return learningResources.filter(r => r.certificationId === certId);
}

/** Resolve ids the advisor attached to a week. Unknown ids are dropped, not
 *  guessed at — see the resourceIds note in lib/ai/advisor.ts. */
export function getResourcesByIds(ids: readonly string[]): LearningResource[] {
  const byId = new Map(learningResources.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is LearningResource => r !== undefined);
}
