f = open('17.txt')
l = [int(s) for s in f]
mn = min(x for x in l if len(str(x))==3 and x%10==7)

sums = []
for i in range(len(l)-1):
    a,b = l[i],l[i+1]
    if (len(str(a))==3) + (len(str(b))==3) == 1:
        if (a+b)%mn==0:
            sums.append(a+b)
print(len(sums),min(sums))