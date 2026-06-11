f = open('26.txt')
#267 994
l = []
for s in f:
    st,end = s.split()
    st = int(st)
    end = int(end)
    l.append([st, end])
l.sort()
cnt = 0
okna = [-1] * 268
for st,end in l:
    for i in range(1,268):
        if okna[i] < st:
            okna[i] = end
            cnt += 1
            posl_okno = i
            break
print(cnt, posl_okno)