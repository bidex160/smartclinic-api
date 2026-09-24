import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SmartClinicServiceCatalogueItem } from './entities/smartclinic-service-catalogue-item.entity';
import { ClinicalDecisionSupportRule } from './entities/clinical-decision-support-rule.entity';
import { ClinicalDecisionSupportSuggestDto } from './dto/clinical-decision-support.dto';

@Injectable()
export class ClinicalDecisionSupportService {
 constructor(
  @InjectRepository(ClinicalDecisionSupportRule) private readonly rules:Repository<ClinicalDecisionSupportRule>,
  @InjectRepository(SmartClinicServiceCatalogueItem) private readonly catalogue:Repository<SmartClinicServiceCatalogueItem>,
 ){}
 async suggest(dto:ClinicalDecisionSupportSuggestDto){
  const fields=[dto.presentingComplaint,dto.historyOfPresentingComplaint,dto.observations,dto.assessment,dto.diagnosis].filter(Boolean).join(' ').toLowerCase();
  if(fields.trim().length<2)return {diagnoses:[],redFlags:[]};
  const rules=await this.rules.find({where:{isActive:true},order:{sortOrder:'ASC'}});
  const ranked=rules.map(rule=>{
    const diagnosisText=(dto.diagnosis||'').toLowerCase();
    const allDiagnosisTerms=[rule.diagnosisName,...rule.synonyms].map(x=>x.toLowerCase());
    const diagnosisHits=allDiagnosisTerms.filter(t=>t.length>2&&diagnosisText.includes(t)).length;
    const symptomHits=rule.symptomTerms.filter(t=>t.length>2&&fields.includes(t.toLowerCase())).length;
    const score=diagnosisHits*5+symptomHits;
    const matched=[...rule.symptomTerms.filter(t=>fields.includes(t.toLowerCase())),...allDiagnosisTerms.filter(t=>diagnosisText.includes(t))].slice(0,5);
    return {rule,score,matched};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.rule.sortOrder-b.rule.sortOrder).slice(0,5);
  const codes=[...new Set(ranked.flatMap(x=>[...x.rule.suggestedLabCodes,...x.rule.suggestedImagingCodes,...x.rule.suggestedMedicationCodes]))];
  const items=codes.length?await this.catalogue.find({where:{code:In(codes),isActive:true}}):[];
  const map=new Map(items.map(x=>[x.code,x]));
  const view=(code:string)=>{const x=map.get(code);if(!x)return null;const cost=Number(x.averageCostMinor);return {code:x.code,category:x.category,name:x.name,groupName:x.groupName,requiresPrescription:x.requiresPrescription,standardPriceMinor:Math.ceil(cost*(10000+x.markupBps)/10000),currency:x.currency};};
  const redFlags=[...new Set(rules.flatMap(rule=>rule.redFlagTerms.filter(t=>fields.includes(t.toLowerCase()))))];
  return {redFlags,diagnoses:ranked.map(({rule,matched})=>({
    code:rule.code,diagnosisName:rule.diagnosisName,reason:matched.length?`Matched: ${matched.join(', ')}`:'Matches the documented clinical context',
    clinicalNote:rule.clinicalNote,
    labs:rule.suggestedLabCodes.map(view).filter(Boolean),
    imaging:rule.suggestedImagingCodes.map(view).filter(Boolean),
    medications:rule.suggestedMedicationCodes.map(view).filter(Boolean),
    referrals:rule.suggestedReferrals,
  }))};
 }
}
