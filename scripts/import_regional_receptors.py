#!/usr/bin/env python3
"""Rebuild the small regional PET data extract using only Python's standard library.

The source revision AND SHA-256 hashes are pinned. No subject-level data is used.
Run from any directory: python3 scripts/import_regional_receptors.py
"""
import hashlib
import io
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
REVISION = 'f8b41da92a733f99368c1f39d4959731aa1316c1'
REPOSITORY = 'https://github.com/netneurolab/hansen_receptors'
BASE = f'https://raw.githubusercontent.com/netneurolab/hansen_receptors/{REVISION}/'
ATLAS_PATH = 'data/lausanne/region_info_scale033.xlsx'
ATLAS_HASH = 'a44d8403dd802dc9010653a11b6207be47bc4d507cd766e89f4c14c70314ff89'
METADATA_PATH = 'manuscript/Table_S3.xlsx'
METADATA_HASH = '519a99ae54ffd6629ae3010c74d5711ad53ddb9d7f64a741a283f886564a48d0'

SOURCES = [
    dict(target='SERT', file='5HTT_dasb_hc100_beliveau.csv',
         sha256='a3fc912b0c5812e194a1030f2275672dc6c5a9725263ed6560188ce133147996',
         tracer='[11C]DASB', sampleSize=100, parameter='Bmax (PET calibrated to autoradiography)', rawUnits='pmol/mL',
         sourceTitle='Beliveau et al. (2017), human serotonin atlas', sourceUrl='https://doi.org/10.1523/JNEUROSCI.2830-16.2016',
         normalizationSet='cortex', coverage='mapped',
         limitations=['Healthy group-average PET distribution; not an individual or drug-challenge measurement.', 'Raphe is not resolved by these parcels; no brainstem value is substituted.']),
    dict(target='HT1A', file='5HT1a_cumi_hc8_beliveau.csv',
         sha256='edfff03ed47079ede0505399401dbf9a1481e98702219e2093aba2f96f229843',
         tracer='[11C]CUMI-101', sampleSize=8, parameter='Bmax (PET calibrated to autoradiography)', rawUnits='pmol/mL',
         sourceTitle='Beliveau et al. (2017), human serotonin atlas', sourceUrl='https://doi.org/10.1523/JNEUROSCI.2830-16.2016',
         normalizationSet='cortex', coverage='mapped',
         limitations=['Small group-average sample (8); PET binding is an indirect density estimate.', 'No distinction between postsynaptic receptors and raphe autoreceptors.']),
    dict(target='HT2A', file='5HT2a_cimbi_hc29_beliveau.csv',
         sha256='5b724b1575e3f5bff256dbe2c9ad30bd5bfc8b77b805f56db07348a6ecda651e',
         tracer='[11C]CIMBI-36', sampleSize=29, parameter='Bmax (PET calibrated to autoradiography)', rawUnits='pmol/mL',
         sourceTitle='Beliveau et al. (2017), human serotonin atlas', sourceUrl='https://doi.org/10.1523/JNEUROSCI.2830-16.2016',
         normalizationSet='cortex', coverage='mapped',
         limitations=['Agonist-tracer binding and PET spatial resolution do not resolve layer- or cell-type-specific signaling.', 'The atlas does not measure psychedelic-induced firing or subjective experience.']),
    dict(target='GABAA', file='GABAa-bz_flumazenil_hc16_norgaard.csv',
         sha256='f76da8cd9f25fb344e5e1439366a7aeaa0a1db1b046ad6a780a40f8b802ba2f8',
         tracer='[11C]flumazenil', sampleSize=16, parameter='Bmax of benzodiazepine binding sites (PET calibrated to autoradiography)', rawUnits='pmol/mL',
         sourceTitle='Nørgaard et al. (2021), human benzodiazepine-site atlas', sourceUrl='https://doi.org/10.1016/j.neuroimage.2021.117878',
         normalizationSet='cortex', coverage='mapped',
         limitations=['Maps benzodiazepine-sensitive GABAA sites, not all GABAA subtypes or total inhibitory capacity.', 'Using this site map for the model’s lumped GABAA target is a target-family approximation.']),
    dict(target='D2', file='D2_fallypride_hc49_jaworska.csv',
         sha256='9bde11698b7715a6b6b1d2fc5ea2b3ef9a05da6e0618d192e8e6961f11b5f607',
         tracer='[18F]fallypride', sampleSize=49, parameter='BP_ND (D2/3 availability)', rawUnits='dimensionless BP_ND',
         sourceTitle='Jaworska et al. (2020), extrastriatal D2/3 PET; Hansen atlas subset', sourceUrl='https://doi.org/10.1038/s41386-020-0662-7',
         normalizationSet='cortex', coverage='extrastriatal',
         limitations=['D2/3 tracer, used as a proxy for the model’s D2 target; binding also depends on endogenous dopamine.', 'Atlas subset n=49 differs from the original study n=58; young participants included high- and low-externalizing-trait groups.', 'The 90-minute protocol studied extrastriatal binding; striatal coefficients remain estimates.']),
    dict(target='DAT', file='DAT_fepe2i_hc6_sasaki.csv',
         sha256='b0227891283df534c39221f16a42c62d26c3e6570e25018b2a7244a7e2f44334',
         tracer='[18F]FE-PE2I', sampleSize=6, parameter='BP_ND (DAT availability)', rawUnits='dimensionless BP_ND',
         sourceTitle='Sasaki et al. (2012), DAT PET; Hansen atlas subset', sourceUrl='https://doi.org/10.2967/jnumed.111.101626',
         normalizationSet='caudate-putamen', coverage='striatal',
         limitations=['Atlas subset n=6 differs from the original quantification study n=10.', 'Only the striatal proxy is used; low/negative extrastriatal BP_ND is not interpreted as transporter density.', 'Whole caudate is a proxy for associative striatum; it does not isolate an associative territory.']),
]


def download(path, expected):
    data = urllib.request.urlopen(BASE + path, timeout=45).read()
    actual = hashlib.sha256(data).hexdigest()
    if actual != expected:
        raise ValueError(f'SHA-256 mismatch for {path}: {actual}')
    return data


def atlas_rows(data):
    ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        result = []
        for row in sheet.findall('.//m:row', ns)[1:]:
            cells = {}
            for cell in row:
                value = cell.find('m:v', ns)
                if value is not None:
                    cells[''.join(filter(str.isalpha, cell.attrib['r']))] = strings[int(value.text)] if cell.attrib.get('t') == 's' else value.text
            result.append(dict(index=int(cells['A']), code=int(cells['B']), label=cells['C'], hemisphere=cells['D'], structure=cells['E']))
    if len(result) != 83 or [r['index'] for r in result] != list(range(83)):
        raise ValueError('Unexpected atlas row order or parcel count')
    return result


def main():
    parcels = atlas_rows(download(ATLAS_PATH, ATLAS_HASH))
    download(METADATA_PATH, METADATA_HASH)  # Validate the metadata version used below.
    maps = {}
    for definition in SOURCES:
        source = dict(definition)
        path = 'data/PET_parcellated/scale033/' + source.pop('file')
        raw = download(path, source['sha256']).decode().strip()
        values = [float(value) for value in raw.replace('\n', ',').split(',') if value]
        if len(values) != len(parcels):
            raise ValueError(f'Unexpected map shape: {path}')
        reference = [p['index'] for p in parcels if (p['structure'] == 'cortex' if source['normalizationSet'] == 'cortex' else p['label'] in ('caudate', 'putamen'))]
        target = source.pop('target')
        maps[target] = dict(source, sourceId=f'hansen-2022-{target.lower()}', path=path, dataUrl=BASE + path, values=values,
                            normalizationReference=reference, normalizationMean=sum(values[i] for i in reference)/len(reference))
    result = dict(schemaVersion=1, title='Human regional receptor/transporter PET reference maps',
                  attribution='Hansen et al. (2022) and the original data authors cited per map; extracted and normalized for NeuroScope.',
                  repository=REPOSITORY, revision=REVISION, atlas='Cammoun/Lausanne scale033 (83 parcels)',
                  atlasSource=dict(path=ATLAS_PATH, sha256=ATLAS_HASH, url=BASE + ATLAS_PATH),
                  metadataSource=dict(path=METADATA_PATH, sha256=METADATA_HASH, url=BASE + METADATA_PATH),
                  citationUrl='https://doi.org/10.1038/s41593-022-01186-3',
                  license='CC-BY-NC-SA-4.0', licenseUrl='https://creativecommons.org/licenses/by-nc-sa/4.0/',
                  sourceLicenseUrl=BASE + 'LICENSE.md',
                  disclaimer='Atlas data supplied without warranties. This derived dataset retains the source data license; no endorsement is implied.',
                  modifications='Six maps and atlas labels extracted to JSON; within-target normalizers added. No raw PET values changed or imputed.',
                  parcels=parcels, maps=maps)
    output = ROOT / 'public/data/regional-receptors.json'
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(f'Wrote {output}: {len(maps)} maps × {len(parcels)} parcels')


if __name__ == '__main__':
    main()
