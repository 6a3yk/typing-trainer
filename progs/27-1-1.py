from math import dist
clA = [[],[]]
for s in open('27_A.txt'):
    x,y = [float(c) for c in s.split()]
    if y>15: clA[0].append([x,y])
    else: clA[1].append([x,y])
clB = [[],[],[]]
for s in open('27_B.txt'):
    x,y = [float(c) for c in s.split()]
    if 0<x<10:clB[0].append([x,y]) 
    elif 10<x<20:clB[1].append([x,y])
    elif 20<x<30:clB[2].append([x,y])
def centroid(cl):
    sd = []
    for p in cl:
        sumdist = sum(dist(p,p1) for p1 in cl)
        sd.append([sumdist,p])
    return min(sd)[1]
cxA = [centroid(cl)[0] for cl in clA]
cyA = [centroid(cl)[1] for cl in clA]
Px = sum(cxA)
Py = sum(cyA)
print(int(Px*10000),int(Py*10000))
cxB = [centroid(cl)[0] for cl in clB]
cyB = [centroid(cl)[1] for cl in clB]
cdists = [dist([cxB[i],cyB[i]],[cxB[j],cyB[j]]) for i,j in [(0,1),(1,2),(0,2)]]
Q1 = min(cdists)
Q2 = max(cdists)
print(int(Q1*10000),int(Q2*10000))