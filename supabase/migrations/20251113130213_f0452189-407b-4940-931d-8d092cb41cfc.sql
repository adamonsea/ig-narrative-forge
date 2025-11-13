-- Add all medical device development keywords directly to topics.keywords array
UPDATE topics
SET keywords = array_cat(
  COALESCE(keywords, ARRAY[]::text[]),
  ARRAY[
    'device lifecycle', 'design for manufacturability', 'DFM', 'requirements engineering',
    'risk–benefit analysis', 'device master record', 'DMR', 'device history record', 'DHR',
    'design input requirements', 'design output documentation', 'human factors validation',
    'verification protocol', 'validation protocol', 'process validation', 'equipment qualification',
    'IQ/OQ/PQ', 'technology readiness level', 'TRL', 'prototype iteration', 'failure analysis',
    'root-cause analysis', 'corrective and preventive action', 'CAPA', 'hazard analysis',
    'failure mode effects analysis', 'FMEA', 'design failure mode effects analysis', 'DFMEA',
    '510(k) pathways', 'de novo classification', 'PMA submission', 'regulatory submissions',
    'CE mark', 'CE MDR', 'notified bodies', 'technical file documentation',
    'clinical evaluation report', 'CER', 'risk management file', 'post-market clinical follow-up',
    'PMCF', 'post-market vigilance', 'UDI', 'device labeling', 'regulatory intelligence',
    'regulatory harmonization', 'QMS audits', 'regulatory gap analysis',
    'additive manufacturing', 'AM', 'rapid tooling', 'cleanroom manufacturing', 'microfabrication',
    'materials characterization', 'smart materials', 'bioinert materials', 'shape-memory alloys',
    'silicone medical molding', 'implantable polymers', 'thin-film coatings', 'plasma surface treatment',
    'sterile barrier packaging', 'sterile processing', 'packaging integrity testing', 'assembly automation',
    'microfluidic fabrication', 'MEMS devices', 'micro-electromechanical systems',
    'point-of-care diagnostics', 'lab-on-chip systems', 'biosensor arrays', 'multiplex diagnostics',
    'non-invasive monitoring', 'wearable biosensors', 'continuous patient monitoring',
    'clinical decision support systems', 'remote diagnostics', 'diagnostic accuracy studies',
    'sensitivity and specificity', 'limit of detection', 'LOD', 'AI-assisted diagnostics',
    'SaMD', 'software as a medical device', 'AI/ML-enabled medical devices', 'digital therapeutics',
    'DTx', 'cloud-enabled devices', 'real-world evidence', 'RWE', 'interoperability standards',
    'HL7', 'FHIR integration', 'cybersecurity hardening', 'penetration testing', 'device connectivity',
    'embedded firmware', 'wireless telemetry', 'machine learning validation', 'algorithm transparency',
    'data governance', 'digital biomarkers',
    'biofabrication', 'bioprinting', 'hydrogel scaffolds', 'engineered tissues', 'organ-on-chip platforms',
    'microbiome diagnostics', 'cellular therapies', 'ex vivo testing', 'regenerative implants',
    'nanomedicine', 'nanoparticle delivery', 'biosynthetic materials', 'tissue integration',
    'transdermal systems', 'electroceuticals', 'neurostimulation devices', 'closed-loop systems',
    'smart prosthetics', 'haptic feedback devices',
    'first-in-human studies', 'pilot feasibility trials', 'pivotal trials', 'clinical endpoints',
    'clinical performance studies', 'usability clinical trials', 'post-market evidence generation',
    'device safety profiling', 'adverse event reporting', 'real-world performance data',
    'device durability studies', 'human applicability studies', 'comparative effectiveness research',
    'component sourcing', 'supplier qualification', 'supplier audits', 'inventory traceability',
    'cold-chain logistics', 'manufacturing scalability', 'batch release testing', 'production line validation',
    'supply chain resilience', 'materials shortages', 'cost-of-goods optimization', 'COGS',
    'lean manufacturing', 'automation integration',
    'active implants', 'passive implants', 'orthobiologics', 'gait analysis systems',
    'robotic rehabilitation', 'prosthetic socket design', 'osseointegration', 'neuroprosthetics',
    'biomechanical modeling', 'surgical guidance systems', 'robotic-assisted surgery', 'navigation systems',
    'end effectors', 'electrosurgical systems', 'respiratory assist devices', 'cardiac rhythm management devices',
    'ISO 14971 risk management', 'human factors hazard analysis', 'toxicity testing',
    'extractables and leachables', 'sterility assurance level', 'SAL', 'environmental monitoring',
    'bioburden testing', 'device malfunction analysis', 'trend reporting', 'process controls',
    'audit readiness', 'qualification matrices',
    'health technology assessment', 'HTA', 'market access strategy', 'reimbursement pathways',
    'health economics and outcomes research', 'HEOR', 'value-based care', 'clinical workflow integration',
    'device lifecycle management', 'innovation pipelines', 'commercial readiness', 'KOL perspectives',
    'key opinion leaders', 'hospital procurement trends', 'technology scouting', 'R&D collaboration models',
    'manufacturing partnerships', 'venture investment in medtech', 'technology commercialization'
  ]::text[]
)
WHERE id = '3f05c5a3-3196-455d-bff4-e9a9a20b8615';

-- Remove any duplicate keywords
UPDATE topics
SET keywords = (
  SELECT array_agg(DISTINCT keyword ORDER BY keyword)
  FROM unnest(keywords) AS keyword
)
WHERE id = '3f05c5a3-3196-455d-bff4-e9a9a20b8615';