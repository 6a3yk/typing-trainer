f = open('26.txt')
#1000 10000
l = []
for s in f:
    st,end = s.split()
    st = int(st)
    end = int(end)
    l.append([end, st])
l.sort()
vz = [l[0]]
for mer in l:
    end,st = mer
    end1,st1 = vz[-1]
    if st >= end1:
        vz.append(mer)
for mer in l:
    end,st = mer
    end1,st1 = vz[-1]
    end2,st2 = vz[-2]
    if st >= end2 and end >= end1:
        vz.pop(-1)
        vz.append(mer)
print(len(vz),vz[-1])