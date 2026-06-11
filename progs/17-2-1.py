f = open('17.txt')
l = [int(s) for s in f]
mx = max(x for x in l if abs(x)%100==25)

sums = []
for i in range(len(l)-2):
    a,b,c = l[i],l[i+1],l[i+2]
    if (1000<=abs(a)<=9999) + (1000<=abs(b)<=9999) + (1000<=abs(c)<=9999) <= 2:
        if a+b+c <= mx:
            sums.append(a+b+c)
print(len(sums),max(sums))