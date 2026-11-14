"""Bounded local red/dark spot correction; no models or image inpainting."""
from time import perf_counter

import cv2
import numpy as np


def _byte(value):
    return np.rint(np.clip(value, 0, 255)).astype(np.uint8)


def correct_selective_spots(image, masks, faces, wire, strength=1., collect_debug=False, correct_red=True):
    started = perf_counter()
    result = image.copy()
    h, w = image.shape[:2]
    info = {"red_spots": 0, "dark_spots": 0, "analysis_max_side": 512}
    debug = np.zeros((h, w), np.float32) if collect_debug else None
    if not faces or strength <= 0:
        info["processing_ms"] = (perf_counter()-started)*1000
        return result, info, debug
    strength = float(np.clip(strength, 0, 1))
    # Track applied intensity, so overlapping face boxes do not double a correction.
    coverage = np.zeros((h, w), np.float32)
    for face in faces:
        bx, by, bw, bh = map(int, face["box"])
        x0, y0 = max(0,bx), max(0,by)
        x1, y1 = min(w,bx+bw), min(h,by+bh)
        if x1-x0 < 16 or y1-y0 < 16:
            continue
        region = np.s_[y0:y1,x0:x1]
        crop = image[region]
        scale = min(1.,512./max(crop.shape[:2]))
        size = (max(1,round(crop.shape[1]*scale)),max(1,round(crop.shape[0]*scale)))
        small = cv2.resize(crop,size,interpolation=cv2.INTER_AREA) if scale<1 else crop
        lab = cv2.cvtColor(small,cv2.COLOR_BGR2LAB).astype(np.float32)
        safe_full = masks["skin"][region]*(1-np.clip(masks["lip"][region]+masks["eye_sharp"][region],0,1))
        # Five-point geometry protects existing features in the face's own axes.
        # It does not semantically identify a hand occluding otherwise skin-like pixels.
        feature = np.zeros(crop.shape[:2],np.uint8)
        landmarks = np.asarray(face["landmarks"],np.float32)-[x0,y0]
        eye_axis = landmarks[1]-landmarks[0]
        length = float(np.linalg.norm(eye_axis))
        if length < 2:
            continue
        down = np.array([-eye_axis[1],eye_axis[0]],np.float32)/length
        if down[1]<0:
            down=-down
        angle = float(np.degrees(np.arctan2(eye_axis[1],eye_axis[0])))
        for point in landmarks[:2]:
            center = tuple(np.rint(point-down*bh*.025).astype(int))
            cv2.ellipse(feature,center,(max(2,int(bw*.14)),max(2,int(bh*.07))),angle,0,360,1,-1)
        cv2.ellipse(feature,tuple(np.rint(landmarks[2]+down*bh*.025).astype(int)),
                    (max(2,int(bw*.12)),max(2,int(bh*.045))),angle,0,360,1,-1)
        safe_full = np.clip(safe_full,0,1)*(1-feature)
        safe = cv2.resize(safe_full,size,interpolation=cv2.INTER_AREA) if scale<1 else safe_full
        edge = cv2.resize(wire[region],size,interpolation=cv2.INTER_AREA) if scale<1 else wire[region]
        width = bw*scale
        kernel = max(5,int(width*.09)|1)
        redness = None
        if correct_red:
            reference_a = cv2.medianBlur(lab[...,1].astype(np.uint8),kernel).astype(np.float32)
            redness = cv2.GaussianBlur(lab[...,1],(0,0),max(.6,width*.003))-reference_a
        reference_l = cv2.medianBlur(lab[...,0].astype(np.uint8),kernel).astype(np.float32)
        darkness = reference_l-lab[...,0]
        candidates = []
        if correct_red:
            candidates.append(("red",(redness>1.2)&(lab[...,1]>138)&(safe>.20)))
        candidates.append(("dark",(darkness>4)&(darkness<20)&(safe>.30)&(edge<.65)))
        # Use the strongest candidate contribution per pixel, never sum overlaps.
        delta = np.zeros_like(lab)
        alpha = np.zeros(lab.shape[:2],np.float32)
        for kind, candidate in candidates:
            count,labels,stats,_ = cv2.connectedComponentsWithStats(candidate.astype(np.uint8),8)
            for index in range(1,count):
                x,y,cw,ch,area = stats[index]
                if area<4 or area>max(12,width*width*.004) or max(cw,ch)>width*.12:
                    continue
                if max(cw,ch)/max(1,min(cw,ch))>3:
                    continue
                pad=max(3,int(width*.018))
                rx0,ry0=max(0,x-pad),max(0,y-pad)
                rx1,ry1=min(size[0],x+cw+pad),min(size[1],y+ch+pad)
                local=np.s_[ry0:ry1,rx0:rx1]
                patch=(labels[local]==index).astype(np.uint8)
                ring=cv2.dilate(patch,np.ones((pad*2+1,pad*2+1),np.uint8))>0
                ring &= (patch==0)&(safe[local]>.3)&(edge[local]<.65)
                if correct_red:
                    ring &= redness[local]<1.2
                if np.count_nonzero(ring)<8:
                    continue
                target=np.median(lab[local][ring],axis=0)
                weight=cv2.GaussianBlur(patch.astype(np.float32),(0,0),max(.7,width*.0025))
                weight*=safe[local]*(1-.3*edge[local])*strength
                np.maximum(alpha[local],weight,out=alpha[local])
                if kind=="red":
                    a=np.clip(lab[local][...,1]-target[1],0,12)*.95*weight
                    np.minimum(delta[local][...,1],-a,out=delta[local][...,1])
                    b=np.clip(target[2]-lab[local][...,2],-3,3)*.25*weight
                    previous=delta[local][...,2]
                    previous[:]=np.where(np.abs(b)>np.abs(previous),b,previous)
                else:
                    lift=np.clip(target[0]-lab[local][...,0]-1,0,8)*.65*weight
                    np.maximum(delta[local][...,0],lift,out=delta[local][...,0])
                info[kind+"_spots"]+=1
        if not np.any(alpha>1e-4):
            continue
        full_size=(crop.shape[1],crop.shape[0])
        if scale<1:
            delta=cv2.resize(delta,full_size,interpolation=cv2.INTER_LINEAR)
            alpha=cv2.resize(alpha,full_size,interpolation=cv2.INTER_LINEAR)
        eligible=(safe_full>.01)&(alpha>1e-4)
        remaining=1-coverage[region]
        delta*=remaining[...,None]
        delta[~eligible]=0
        original_lab=cv2.cvtColor(crop,cv2.COLOR_BGR2LAB)
        roundtrip=cv2.cvtColor(original_lab,cv2.COLOR_LAB2BGR)
        corrected=cv2.cvtColor(_byte(original_lab.astype(np.float32)+delta),cv2.COLOR_LAB2BGR)
        rgb_delta=corrected.astype(np.int16)-roundtrip.astype(np.int16)
        rgb_delta[~eligible]=0
        result[region]=_byte(result[region].astype(np.int16)+rgb_delta)
        # Only claim pixels receiving an actual correction, not the whole face box.
        coverage[region][eligible]=1
        if collect_debug:
            debug[region]=np.maximum(debug[region],alpha*eligible)
    info["processing_ms"]=(perf_counter()-started)*1000
    return result,info,debug
